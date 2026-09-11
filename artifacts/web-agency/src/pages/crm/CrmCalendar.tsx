import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock,
  Download, Link2, Loader2, MapPin, Plus, RefreshCw, Trash2, Users, X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// ── M3: the internal calendar ────────────────────────────────────────────────
//
// Until M3 this page had no appointments in it. It read the task list and the
// leads' next-follow-up dates and drew those as "events", which meant the
// calendar could show you a deadline but you could not put a meeting on it.
//
// Now there are three distinct layers and the page never blurs them:
//
//   Appointments  real rows in crm_appointments — created, moved, cancelled
//                 and completed from here, and they drive reminder jobs.
//   Tasks due     a task's due date. Read-only here; All Tasks owns it.
//   Follow-ups    a lead's nextFollowUpAt. Read-only here; the lead owns it.
//
// Two things this calendar deliberately does not claim:
//   * Adding an attendee records who is expected. No invitation is emailed —
//     attendee mail does not exist yet, and the API says so on every create.
//   * The .ics button is an export. It copies the event into another calendar
//     once; later edits here do not follow it. That is not synchronisation.

// ── Types (the live API contract) ────────────────────────────────────────────

interface Attendee {
  id: number;
  staffId?: number | null;
  name?: string | null;
  email?: string | null;
  external: boolean;
  responseStatus: string;
}

interface Appointment {
  id: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  location?: string | null;
  meetingUrl?: string | null;
  status: string;
  leadId?: number | null;
  projectId?: number | null;
  organizerStaffId?: number | null;
  createdByLabel: string;
  reminderMinutesBefore?: number | null;
  cancelReason?: string | null;
  attendees: Attendee[];
  lead?: { id: number; name: string; company?: string | null } | null;
  project?: { id: number; name: string } | null;
}

interface StaffMember {
  id: number;
  displayName: string;
  status: string;
}

interface OverlayEvent {
  id: string;
  dateKey: string;
  title: string;
  kind: "task" | "followUp";
  href: string;
}

type Scope = "mine" | "team";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Date helpers ─────────────────────────────────────────────────────────────
//
// Everything on screen is rendered in the browser's own timezone. The
// appointment carries the zone it was booked in, and the detail panel shows it
// whenever the two differ, rather than silently presenting one as the other.

const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function keyOfInstant(iso: string): string {
  return dateKey(new Date(iso));
}

/** An ISO instant as the "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function rangeLabel(a: Appointment): string {
  if (a.allDay) return "All day";
  return `${timeLabel(a.startAt)} – ${timeLabel(a.endAt)}`;
}

function dayHeading(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-teal-50 text-teal-800 border-teal-200",
  completed: "bg-green-50 text-green-800 border-green-200",
  cancelled: "bg-muted text-muted-foreground border-border line-through",
};

// ── Create / edit form state ─────────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string;
  meetingUrl: string;
  reminderMinutesBefore: string;
  attendeeStaffIds: number[];
  externalEmail: string;
}

function blankForm(day: string): FormState {
  const start = new Date(`${day}T09:00:00`);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    title: "",
    description: "",
    startAt: toLocalInput(start.toISOString()),
    endAt: toLocalInput(end.toISOString()),
    allDay: false,
    location: "",
    meetingUrl: "",
    reminderMinutesBefore: "30",
    attendeeStaffIds: [],
    externalEmail: "",
  };
}

function formFrom(a: Appointment): FormState {
  return {
    title: a.title,
    description: a.description ?? "",
    startAt: toLocalInput(a.startAt),
    endAt: toLocalInput(a.endAt),
    allDay: a.allDay,
    location: a.location ?? "",
    meetingUrl: a.meetingUrl ?? "",
    reminderMinutesBefore: a.reminderMinutesBefore == null ? "" : String(a.reminderMinutesBefore),
    attendeeStaffIds: a.attendees.filter(x => x.staffId != null).map(x => x.staffId as number),
    externalEmail: "",
  };
}

export default function CrmCalendar() {
  const [today] = useState(new Date());
  const [current, setCurrent] = useState(new Date());
  const [scope, setScope] = useState<Scope>("mine");
  const [selected, setSelected] = useState<string>(dateKey(new Date()));

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [overlay, setOverlay] = useState<OverlayEvent[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffUnavailable, setStaffUnavailable] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<Appointment | null>(null);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState<FormState>(() => blankForm(dateKey(new Date())));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const year = current.getFullYear();
  const month = current.getMonth();
  const todayKey = dateKey(today);

  // The window we ask the server for: the whole visible grid plus a margin, so
  // moving a month does not blank the page while a new request is in flight.
  const windowFrom = useMemo(() => new Date(year, month - 1, 1).toISOString(), [year, month]);
  const windowTo = useMemo(() => new Date(year, month + 2, 0, 23, 59, 59).toISOString(), [year, month]);

  const loadAppointments = useCallback(async () => {
    const params = new URLSearchParams({ scope, from: windowFrom, to: windowTo, includeCancelled: "true" });
    const res = await adminFetch(`/api/crm/appointments?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `The calendar could not be loaded (${res.status}).`);
    }
    const data = await res.json();
    setAppointments(data.appointments ?? []);
  }, [scope, windowFrom, windowTo]);

  const loadOverlay = useCallback(async () => {
    // Tasks and follow-ups are supporting context. If either is unavailable the
    // calendar still works, so a failure here dims a layer instead of the page.
    const events: OverlayEvent[] = [];
    const [tasksRes, leadsRes] = await Promise.all([
      adminFetch("/api/crm/tasks").catch(() => null),
      adminFetch("/api/crm/leads").catch(() => null),
    ]);
    if (tasksRes?.ok) {
      const data = await tasksRes.json().catch(() => ({}));
      for (const t of data.tasks ?? []) {
        if (!t.dueDate || t.status === "completed") continue;
        events.push({
          id: `task-${t.id}`,
          dateKey: keyOfInstant(t.dueDate),
          title: t.title,
          kind: "task",
          href: "/admin/crm/my-day",
        });
      }
    }
    if (leadsRes?.ok) {
      const data = await leadsRes.json().catch(() => ({}));
      for (const l of data.leads ?? []) {
        if (!l.nextFollowUpAt) continue;
        events.push({
          id: `followup-${l.id}`,
          dateKey: keyOfInstant(l.nextFollowUpAt),
          title: `Follow up: ${l.name}`,
          kind: "followUp",
          href: `/admin/crm/leads/${l.id}`,
        });
      }
    }
    setOverlay(events);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      await Promise.all([loadAppointments(), loadOverlay()]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The calendar could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadAppointments, loadOverlay]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The attendee picker needs the staff list, which requires staff.read. A
  // legacy bearer session does not have it, so say the picker is unavailable
  // rather than rendering an empty list that looks like "nobody works here".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await adminFetch("/api/crm/staff").catch(() => null);
      if (cancelled) return;
      if (!res?.ok) {
        setStaffUnavailable(
          res?.status === 403
            ? "Sign in with your own staff account to pick attendees from the team."
            : "The team list could not be loaded, so attendees cannot be picked here.",
        );
        return;
      }
      const data = await res.json().catch(() => ({}));
      // Anyone who has not been disabled can be expected at a meeting. Somebody
      // who was invited last week and has not signed in yet is still a person
      // you book a kickoff with — filtering on "active" would have made them
      // unschedulable until they set a password.
      setStaff((data.staff ?? []).filter((s: StaffMember) => s.status !== "disabled"));
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Grid ───────────────────────────────────────────────────────────────────

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const out: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      out.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    for (let d = 1; out.length < 42; d++) {
      out.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    }
    return out;
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const k = keyOfInstant(a.startAt);
      const list = map.get(k) ?? [];
      list.push(a);
      map.set(k, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
  }, [appointments]);

  const overlayByDay = useMemo(() => {
    const map = new Map<string, OverlayEvent[]>();
    for (const e of overlay) {
      const list = map.get(e.dateKey) ?? [];
      list.push(e);
      map.set(e.dateKey, list);
    }
    return map;
  }, [overlay]);

  const selectedAppointments = byDay.get(selected) ?? [];
  const selectedOverlay = overlayByDay.get(selected) ?? [];

  const upcoming = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter(a => a.status === "scheduled" && new Date(a.startAt).getTime() >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 8);
  }, [appointments]);

  // ── Writes ─────────────────────────────────────────────────────────────────

  function openCreate(day: string) {
    setEditing(null);
    setForm(blankForm(day));
    setFormError(null);
    setComposing(true);
  }

  function openEdit(a: Appointment) {
    setEditing(a);
    setForm(formFrom(a));
    setFormError(null);
    setComposing(true);
  }

  function closeForm() {
    setComposing(false);
    setEditing(null);
    setFormError(null);
  }

  async function save() {
    const startAt = fromLocalInput(form.startAt);
    const endAt = fromLocalInput(form.endAt);
    if (form.title.trim().length < 2) { setFormError("Give the appointment a title."); return; }
    if (!startAt || !endAt) { setFormError("Set both a start and an end time."); return; }
    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      setFormError("It cannot end before it starts."); return;
    }

    const external = form.externalEmail.trim();
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      startAt, endAt,
      allDay: form.allDay,
      timezone: BROWSER_ZONE,
      location: form.location.trim() || null,
      meetingUrl: form.meetingUrl.trim() || null,
      reminderMinutesBefore: form.reminderMinutesBefore === "" ? null : Number(form.reminderMinutesBefore),
      attendeeStaffIds: form.attendeeStaffIds,
    };
    if (!editing && external) body["externalAttendees"] = [{ email: external }];

    setSaving(true);
    setFormError(null);
    try {
      const res = editing
        ? await adminFetch(`/api/crm/appointments/${editing.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          })
        : await adminFetch("/api/crm/appointments", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data.error || `Save failed (${res.status}).`); return; }

      setSelected(keyOfInstant(data.appointment.startAt));
      setNotice(
        editing
          ? "Appointment updated. Its reminder was rescheduled to match."
          : "Appointment created. Attendees are recorded — no invitation email was sent.",
      );
      closeForm();
      await refresh(true);
    } catch {
      setFormError("The appointment could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(a: Appointment, status: "completed" | "cancelled" | "scheduled") {
    if (status === "cancelled" && !window.confirm(
      `Cancel "${a.title}"?\n\nIt stays on the record as cancelled and its reminder is withdrawn.`,
    )) return;
    setRefreshing(true);
    try {
      const res = await adminFetch(`/api/crm/appointments/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `That change was refused (${res.status}).`);
        return;
      }
      setNotice(
        status === "cancelled" ? "Appointment cancelled and its reminder withdrawn."
          : status === "completed" ? "Marked as held."
          : "Reopened as scheduled.",
      );
      await refresh(true);
    } finally {
      setRefreshing(false);
    }
  }

  // The .ics route is permission-checked, so it cannot be a plain link — the
  // browser would send no Authorization header. Fetch it, then hand the bytes
  // to the user as a download.
  async function exportIcs(a: Appointment) {
    const res = await adminFetch(`/api/crm/appointments/${a.id}/ics`);
    if (!res.ok) { setError("That appointment could not be exported."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `appointment-${a.id}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("Exported. This is a one-time copy — later changes here will not follow it.");
  }

  if (loading) {
    return (
      <CrmLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-teal-600" /> Calendar
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Times are shown in your browser's timezone ({BROWSER_ZONE}).
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["mine", "team"] as Scope[]).map(s => (
                <button key={s} onClick={() => setScope(s)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    scope === s ? "bg-teal-600 text-white" : "bg-background text-foreground hover:bg-accent"
                  }`}>
                  {s === "mine" ? "Mine" : "Whole team"}
                </button>
              ))}
            </div>
            <button onClick={() => void refresh(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => openCreate(selected)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
              <Plus className="w-3.5 h-3.5" /> New appointment
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
            <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800 flex-1">{notice}</p>
            <button onClick={() => setNotice(null)} className="text-teal-700 hover:text-teal-900"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">

          {/* ── Month grid ───────────────────────────────────────────────── */}
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <h2 className="text-base font-bold text-foreground">{MONTHS[month]} {year}</h2>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => setCurrent(new Date(year, month - 1, 1))}
                  aria-label="Previous month"
                  className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-accent transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setCurrent(new Date(year, month + 1, 1))}
                  aria-label="Next month"
                  className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-accent transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => { setCurrent(new Date()); setSelected(todayKey); }}
                className="ml-auto px-3 py-1 text-xs border border-border rounded-lg hover:bg-accent transition-colors">
                Today
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {DAYS.map(d => (
                <div key={d} className="text-center py-2 text-[11px] font-semibold text-muted-foreground">
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d[0]}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {cells.map((cell, i) => {
                const k = dateKey(cell.date);
                const isToday = k === todayKey;
                const isSel = k === selected;
                const appts = byDay.get(k) ?? [];
                const others = overlayByDay.get(k) ?? [];
                return (
                  <button key={i} onClick={() => setSelected(k)} onDoubleClick={() => openCreate(k)}
                    className={`text-left min-h-[92px] border-r border-b border-border/60 p-1.5 transition-colors ${
                      cell.isCurrentMonth ? "bg-background hover:bg-accent/40" : "bg-muted/30 hover:bg-muted/50"
                    } ${isSel ? "ring-1 ring-inset ring-teal-500" : ""}`}>
                    <div className={`w-6 h-6 flex items-center justify-center text-xs font-semibold rounded-full mb-1 ${
                      isToday ? "bg-teal-600 text-white"
                        : cell.isCurrentMonth ? "text-foreground" : "text-muted-foreground/50"
                    }`}>
                      {cell.date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {appts.slice(0, 2).map(a => (
                        <div key={a.id} title={`${a.title} · ${rangeLabel(a)}`}
                          className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${STATUS_STYLE[a.status] ?? STATUS_STYLE.scheduled}`}>
                          {a.allDay ? "" : `${timeLabel(a.startAt)} `}{a.title}
                        </div>
                      ))}
                      {others.slice(0, appts.length >= 2 ? 0 : 1).map(e => (
                        <div key={e.id} title={e.title}
                          className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                            e.kind === "task"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-sky-50 text-sky-800 border-sky-200"
                          }`}>
                          {e.title}
                        </div>
                      ))}
                      {appts.length + others.length > 2 && (
                        <div className="text-[10px] text-muted-foreground pl-1">
                          +{appts.length + others.length - 2} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-border text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal-200 border border-teal-300" /> Appointments</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-300" /> Tasks due</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-200 border border-sky-300" /> Lead follow-ups</span>
              <span className="ml-auto hidden sm:inline">Double-click a day to book it.</span>
            </div>
          </div>

          {/* ── Selected day + upcoming ──────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-background border border-border rounded-xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold text-foreground truncate">{dayHeading(selected)}</h3>
                <button onClick={() => openCreate(selected)}
                  className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors shrink-0">
                  <Plus className="w-3 h-3" /> Book
                </button>
              </div>

              <div className="divide-y divide-border/60 max-h-[360px] overflow-y-auto">
                {selectedAppointments.length === 0 && selectedOverlay.length === 0 && (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nothing scheduled on this day.</p>
                )}

                {selectedAppointments.map(a => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <button onClick={() => openEdit(a)} className="text-left w-full">
                          <p className={`text-sm font-semibold text-foreground truncate ${a.status === "cancelled" ? "line-through text-muted-foreground" : ""}`}>
                            {a.title}
                          </p>
                        </button>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {rangeLabel(a)}
                          {a.timezone && a.timezone !== BROWSER_ZONE && (
                            <span className="ml-1">· booked in {a.timezone}</span>
                          )}
                        </p>
                        {a.location && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3 h-3 shrink-0" /> {a.location}
                          </p>
                        )}
                        {a.meetingUrl && (
                          <a href={a.meetingUrl} target="_blank" rel="noreferrer"
                            className="text-[11px] text-teal-700 hover:underline flex items-center gap-1 mt-0.5 truncate">
                            <Link2 className="w-3 h-3 shrink-0" /> Join link
                          </a>
                        )}
                        {a.lead && (
                          <Link href={`/admin/crm/leads/${a.lead.id}`}>
                            <span className="text-[11px] text-teal-700 hover:underline cursor-pointer">
                              {a.lead.name}{a.lead.company ? ` · ${a.lead.company}` : ""}
                            </span>
                          </Link>
                        )}
                        {a.attendees.length > 0 && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Users className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {a.attendees.map(x => x.name || x.email || "unnamed").join(", ")}
                            </span>
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_STYLE[a.status] ?? STATUS_STYLE.scheduled}`}>
                        {a.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {a.status === "scheduled" && (
                        <>
                          <button onClick={() => void setStatus(a, "completed")}
                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] border border-green-200 text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors">
                            <Check className="w-3 h-3" /> Held
                          </button>
                          <button onClick={() => void setStatus(a, "cancelled")}
                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] border border-red-200 text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors">
                            <Trash2 className="w-3 h-3" /> Cancel
                          </button>
                        </>
                      )}
                      {a.status !== "scheduled" && (
                        <button onClick={() => void setStatus(a, "scheduled")}
                          className="px-2 py-0.5 text-[11px] border border-border rounded hover:bg-accent transition-colors">
                          Reopen
                        </button>
                      )}
                      <button onClick={() => void exportIcs(a)}
                        title="Download a one-time .ics copy. This is an export, not a sync."
                        className="flex items-center gap-1 px-2 py-0.5 text-[11px] border border-border rounded hover:bg-accent transition-colors">
                        <Download className="w-3 h-3" /> .ics
                      </button>
                    </div>
                  </div>
                ))}

                {selectedOverlay.map(e => (
                  <Link key={e.id} href={e.href}>
                    <div className="px-4 py-2.5 hover:bg-accent transition-colors cursor-pointer">
                      <p className="text-xs text-foreground truncate">{e.title}</p>
                      <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded border ${
                        e.kind === "task"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-sky-50 text-sky-800 border-sky-200"
                      }`}>
                        {e.kind === "task" ? "Task due" : "Lead follow-up"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-background border border-border rounded-xl">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Next up</h3>
              </div>
              <div className="divide-y divide-border/60">
                {upcoming.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No appointments are scheduled in this window.
                  </p>
                ) : upcoming.map(a => (
                  <button key={a.id} onClick={() => { setSelected(keyOfInstant(a.startAt)); openEdit(a); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors">
                    <p className="text-xs font-medium text-foreground truncate">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(a.startAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {rangeLabel(a)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Create / edit ──────────────────────────────────────────────────── */}
      {composing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 p-0 sm:p-4"
          onClick={closeForm}>
          <div className="bg-background w-full sm:max-w-lg sm:rounded-xl rounded-t-xl border border-border max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-background flex items-center gap-2 px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">
                {editing ? "Edit appointment" : "New appointment"}
              </h3>
              <button onClick={closeForm} className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}

              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Title</span>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Kickoff call with Acme"
                  className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Starts</span>
                  <input type="datetime-local" value={form.startAt}
                    onChange={e => {
                      const startAt = e.target.value;
                      // Keep the duration the user already chose when the start moves.
                      const prevStart = new Date(form.startAt).getTime();
                      const prevEnd = new Date(form.endAt).getTime();
                      const span = Number.isFinite(prevStart) && Number.isFinite(prevEnd) && prevEnd > prevStart
                        ? prevEnd - prevStart : 60 * 60_000;
                      const next = new Date(startAt);
                      setForm({
                        ...form, startAt,
                        endAt: Number.isFinite(next.getTime())
                          ? toLocalInput(new Date(next.getTime() + span).toISOString())
                          : form.endAt,
                      });
                    }}
                    className="mt-1 w-full px-2 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ends</span>
                  <input type="datetime-local" value={form.endAt}
                    onChange={e => setForm({ ...form, endAt: e.target.value })}
                    className="mt-1 w-full px-2 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </label>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.allDay}
                  onChange={e => setForm({ ...form, allDay: e.target.checked })}
                  className="rounded border-input" />
                <span className="text-xs text-foreground">All day</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Location</span>
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                    placeholder="Office, or blank"
                    className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Meeting link</span>
                  <input value={form.meetingUrl} onChange={e => setForm({ ...form, meetingUrl: e.target.value })}
                    placeholder="https://…"
                    className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Remind me before</span>
                <select value={form.reminderMinutesBefore}
                  onChange={e => setForm({ ...form, reminderMinutesBefore: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500">
                  <option value="">No reminder</option>
                  <option value="10">10 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="1440">1 day</option>
                </select>
              </label>

              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Who is expected</span>
                {staffUnavailable ? (
                  <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    {staffUnavailable}
                  </p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {staff.map(s => {
                      const on = form.attendeeStaffIds.includes(s.id);
                      return (
                        <button key={s.id} type="button"
                          onClick={() => setForm({
                            ...form,
                            attendeeStaffIds: on
                              ? form.attendeeStaffIds.filter(x => x !== s.id)
                              : [...form.attendeeStaffIds, s.id],
                          })}
                          title={s.status === "invited" ? "Invited — has not signed in yet" : undefined}
                          className={`px-2 py-1 text-[11px] rounded-lg border transition-colors ${
                            on ? "bg-teal-600 text-white border-teal-600" : "bg-background text-foreground border-border hover:bg-accent"
                          }`}>
                          {s.displayName}
                          {s.status === "invited" && <span className="opacity-70"> · invited</span>}
                        </button>
                      );
                    })}
                    {staff.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">No other active staff accounts yet.</p>
                    )}
                  </div>
                )}
              </div>

              {!editing && (
                <label className="block">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Client email (optional)</span>
                  <input type="email" value={form.externalEmail}
                    onChange={e => setForm({ ...form, externalEmail: e.target.value })}
                    placeholder="name@company.com"
                    className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </label>
              )}

              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Notes</span>
                <textarea value={form.description} rows={3}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y" />
              </label>

              <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
                Attendees are recorded on the appointment so the team knows who is expected.
                No invitation email is sent — attendee mail is not built yet. The reminder
                above goes to you through the CRM's own reminder queue.
              </p>
            </div>

            <div className="sticky bottom-0 bg-background flex items-center gap-2 px-4 py-3 border-t border-border">
              <button onClick={closeForm}
                className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors">
                Cancel
              </button>
              <button onClick={() => void save()} disabled={saving}
                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editing ? "Save changes" : "Create appointment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}
