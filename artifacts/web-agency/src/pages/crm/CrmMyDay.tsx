import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, AlertTriangle, Bell, CalendarClock, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock, ListTodo, PauseCircle, Plus,
  RefreshCw, Settings, Sun, UserCheck,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";

// ── M2: My Day ───────────────────────────────────────────────────────────────
//
// One person's working day, read straight from the single task system
// (`/api/crm/my-day`). Everything here writes back through
// `/api/crm/operations/tasks`, so a change made here is the same change the
// scheduler, the digest and every other surface sees — and every mutation is
// followed by a re-read, so what the page shows is what actually persisted.

// ── Types (the live API contract) ────────────────────────────────────────────

interface DayTask {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  dueDate?: string | null;
  remindAt?: string | null;
  priority?: string | null;
  type?: string | null;
  blockedReason?: string | null;
  checklist?: { label: string; done: boolean }[] | null;
  assignedToStaffId?: number | null;
  assigneeName?: string | null;
  leadId?: number | null;
  projectId?: number | null;
  lead?: { id: number; name: string; company?: string | null } | null;
  project?: { id: number; name: string; stage?: string | null } | null;
}

interface FollowUp {
  id: number;
  name: string;
  company?: string | null;
  status?: string | null;
  nextFollowUpAt?: string | null;
  assignedTo?: string | null;
}

type Scope = "mine" | "team";
type TaskBucket = "overdue" | "dueToday" | "upcoming" | "blocked" | "unscheduled";

interface MyDayPayload {
  scope: Scope;
  timezone: string;
  dayStart: string;
  dayEnd: string;
  signedInAs: { id: number; displayName: string } | null;
  counts: Record<TaskBucket | "followUps", number>;
  overdue: DayTask[];
  dueToday: DayTask[];
  upcoming: DayTask[];
  blocked: DayTask[];
  unscheduled: DayTask[];
  followUps: FollowUp[];
}

interface Assignee { id: number; displayName: string; email: string }

interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
}

// ── Time helpers ─────────────────────────────────────────────────────────────
//
// Every date on this page is rendered in the timezone the server reports for
// the signed-in person — not the browser's — because that is the timezone the
// reminder queue and the daily digest actually fire in.

function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function safeZone(zone: string | undefined): string {
  if (zone && isKnownZone(zone)) return zone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type ZoneParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zoneParts(date: Date, timeZone: string): ZoneParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out["year"]),
    month: Number(out["month"]),
    day: Number(out["day"]),
    // Some engines report midnight as hour 24 with hour12:false.
    hour: Number(out["hour"]) % 24,
    minute: Number(out["minute"]),
    second: Number(out["second"]),
  };
}

/** Milliseconds a zone is ahead of UTC at this instant (handles DST). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zoneParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

/** ISO instant → the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in `zone`. */
function toInputValue(iso: string | null | undefined, zone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const p = zoneParts(d, zone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DDTHH:mm" read as wall-clock in `zone` → an ISO instant. */
function fromInputValue(value: string, zone: string): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  // Two passes so a wall-clock time either side of a DST change still lands on
  // the right instant.
  let ts = guess - zoneOffsetMs(new Date(guess), zone);
  ts = guess - zoneOffsetMs(new Date(ts), zone);
  return new Date(ts).toISOString();
}

function formatClock(date: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function formatLongDay(date: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

function formatShortDate(date: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, weekday: "short", day: "numeric", month: "short",
  }).format(date);
}

function sameZoneDay(a: Date, b: Date, zone: string): boolean {
  const x = zoneParts(a, zone);
  const y = zoneParts(b, zone);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/** "Today 14:30" / "Tomorrow 09:00" / "Mon, 14 Sep · 09:00". */
function formatWhen(iso: string | null | undefined, zone: string, today: Date): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const time = formatClock(d, zone);
  if (sameZoneDay(d, today, zone)) return `Today ${time}`;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (sameZoneDay(d, tomorrow, zone)) return `Tomorrow ${time}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (sameZoneDay(d, yesterday, zone)) return `Yesterday ${time}`;
  return `${formatShortDate(d, zone)} · ${time}`;
}

function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const diff = now - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return `${Math.round(days / 30)} mo ago`;
}

/** How far past due, in whole days, for the overdue badge. */
function daysLate(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}

// ── Small presentational pieces ──────────────────────────────────────────────

const PRIORITY_PILL: Record<string, string> = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-muted text-muted-foreground border-border",
};

function PriorityPill({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${
      PRIORITY_PILL[priority] ?? "bg-muted text-muted-foreground border-border"
    }`}>
      {priority}
    </span>
  );
}

function CountBadge({ n, tone }: { n: number; tone: "urgent" | "warm" | "plain" }) {
  const style = n === 0
    ? "bg-muted text-muted-foreground"
    : tone === "urgent" ? "bg-red-100 text-red-700"
    : tone === "warm" ? "bg-amber-100 text-amber-700"
    : "bg-accent text-teal-800";
  return (
    <span className={`tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[22px] text-center ${style}`}>
      {n}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-muted-foreground mb-1">{children}</label>;
}

const INPUT = "w-full px-2.5 py-2 text-sm border border-input rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CrmMyDay() {
  const [, navigate] = useLocation();

  const [data, setData] = useState<MyDayPayload | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [scope, setScope] = useState<Scope>("mine");
  const [teamDenied, setTeamDenied] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [notifAvailable, setNotifAvailable] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState("");

  const zone = safeZone(data?.timezone);
  const today = useMemo(() => (data ? new Date(data.dayStart) : new Date(now)), [data, now]);

  // A minute tick keeps "3 min ago" and the overdue counters honest without
  // re-reading the API.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError("");
    try {
      const r = await adminFetch("/api/crm/notifications?limit=30");
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json() as { notifications: AppNotification[]; unread: number; available: boolean };
      setNotifications(d.notifications ?? []);
      setUnread(d.unread ?? 0);
      setNotifAvailable(d.available !== false);
    } catch {
      setNotifError("Couldn't load notifications.");
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await adminFetch(`/api/crm/my-day?scope=${scope}`);
      if (r.status === 403) {
        const d = await r.json().catch(() => ({})) as { error?: string; permission?: string };
        if (scope === "team") {
          // Not allowed to see everyone's work: say so, disable the toggle and
          // fall back to this person's own day (the effect re-runs the read).
          setTeamDenied(d.error ?? "You do not have permission to see the team's work.");
          setScope("mine");
          return;
        }
        setError(d.error ?? "You do not have access to My Day.");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json() as MyDayPayload;
      setData(d);
      setUpdatedAt(new Date());
      setNow(Date.now());
    } catch {
      setError("Couldn't load your day. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const loadAssignees = useCallback(async () => {
    try {
      const r = await adminFetch("/api/crm/operations/assignees");
      if (!r.ok) return;
      const d = await r.json() as { assignees: Assignee[] };
      setAssignees(d.assignees ?? []);
    } catch {
      // Assignee names are an enhancement; the page works without them.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAssignees(); void loadNotifications(); }, [loadAssignees, loadNotifications]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const patchTask = useCallback(async (id: number, body: Record<string, unknown>) => {
    const r = await adminFetch(`/api/crm/operations/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({})) as { task?: DayTask; error?: string };
    if (!r.ok) return { ok: false as const, error: d.error ?? "That change was refused." };
    return { ok: true as const, task: d.task };
  }, []);

  /** Completing removes the row immediately, then confirms against the server. */
  const complete = useCallback(async (task: DayTask) => {
    const before = data;
    setActionError("");
    setData(prev => (prev ? withoutTask(prev, task.id) : prev));
    const res = await patchTask(task.id, { status: "completed" });
    if (!res.ok) {
      setData(before);           // nothing persisted — put the row back
      setActionError(res.error);
      return;
    }
    await load();
  }, [data, patchTask, load]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const overdue = useMemo(
    () => [...(data?.overdue ?? [])].sort(byDueDateAsc),
    [data],
  );
  const dueToday = useMemo(() => [...(data?.dueToday ?? [])].sort(byDueDateAsc), [data]);
  const upcoming = useMemo(() => [...(data?.upcoming ?? [])].sort(byDueDateAsc), [data]);
  const blocked = data?.blocked ?? [];
  const unscheduled = data?.unscheduled ?? [];
  const followUps = data?.followUps ?? [];

  const total = overdue.length + dueToday.length + upcoming.length
    + blocked.length + unscheduled.length + followUps.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <CrmLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Sun className="w-5 h-5 text-teal-700" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground">My Day</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data?.signedInAs
                  ? <span className="font-medium text-foreground">{data.signedInAs.displayName}</span>
                  : <span>Shared admin sign-in — showing unassigned work</span>}
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                <span className="tabular-nums">{formatLongDay(today, zone)}</span>
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                <span>{zone}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Mine / Team */}
            <div className="flex bg-muted p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setScope("mine")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  scope === "mine" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mine
              </button>
              <button
                type="button"
                onClick={() => { setTeamDenied(""); setScope("team"); }}
                disabled={!!teamDenied}
                title={teamDenied || "Everyone's open work"}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  scope === "team" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Team
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="tabular-nums">
                {updatedAt ? `Updated ${formatClock(updatedAt, zone)}` : "Refresh"}
              </span>
            </Button>
          </div>
        </div>

        {teamDenied && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{teamDenied} Showing your own work instead.</p>
          </div>
        )}

        {actionError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 flex-1">{actionError}</p>
            <button type="button" onClick={() => setActionError("")} className="text-xs text-red-700 underline shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Composer */}
        <AddTaskComposer
          zone={zone}
          assignees={assignees}
          signedInId={data?.signedInAs?.id ?? null}
          onCreated={() => void load()}
        />

        {/* Body */}
        {error ? (
          <div className="rounded-xl border border-border bg-white py-14 px-6 text-center">
            <AlertTriangle className="w-9 h-9 text-red-500/70 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">{error}</p>
            <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => void load()}>
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </Button>
          </div>
        ) : loading && !data ? (
          <DaySkeleton />
        ) : (
          <>
            {total === 0 && (
              <div className="rounded-xl border border-border bg-white py-12 px-6 text-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-teal-600/70 mx-auto mb-3" />
                <p className="text-sm font-semibold text-foreground">Nothing open{scope === "team" ? " across the team" : ""}.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No overdue work, nothing due today and no follow-ups waiting. Add a task above when something comes in.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <Section title="Overdue" tone="urgent" icon={AlertTriangle} count={overdue.length}
                hint="Past due — most urgent first." emptyText="Nothing overdue.">
                {overdue.map(task => (
                  <TaskRow key={task.id} task={task} zone={zone} today={today} now={now}
                    scope={scope} assignees={assignees} accent="urgent"
                    onComplete={() => void complete(task)}
                    onPatch={patchTask} onSaved={() => void load()} />
                ))}
              </Section>

              <Section title="Due today" tone="warm" icon={Clock} count={dueToday.length}
                hint="Committed for today." emptyText="Nothing due today.">
                {dueToday.map(task => (
                  <TaskRow key={task.id} task={task} zone={zone} today={today} now={now}
                    scope={scope} assignees={assignees} accent="warm"
                    onComplete={() => void complete(task)}
                    onPatch={patchTask} onSaved={() => void load()} />
                ))}
              </Section>

              <Section title="Follow-ups" tone="plain" icon={UserCheck} count={followUps.length}
                hint="People waiting to hear back." emptyText="No follow-ups due.">
                {followUps.map(f => (
                  <div key={f.id} className="rounded-lg border border-border bg-white p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <Link href={`/admin/crm/leads/${f.id}`} className="text-sm font-medium text-primary hover:underline">
                          {f.name}
                        </Link>
                        {f.company && <p className="text-xs text-muted-foreground truncate">{f.company}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-foreground tabular-nums">
                          {formatWhen(f.nextFollowUpAt, zone, today) || "No date"}
                        </p>
                        {f.status && <p className="text-[11px] text-muted-foreground">{f.status}</p>}
                      </div>
                    </div>
                    {scope === "team" && f.assignedTo && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">Owner: {f.assignedTo}</p>
                    )}
                  </div>
                ))}
              </Section>

              <Section title="Blocked / waiting" tone="warm" icon={PauseCircle} count={blocked.length}
                hint="Cannot move until something else happens." emptyText="Nothing is blocked.">
                {blocked.map(task => (
                  <TaskRow key={task.id} task={task} zone={zone} today={today} now={now}
                    scope={scope} assignees={assignees} accent="warm"
                    onComplete={() => void complete(task)}
                    onPatch={patchTask} onSaved={() => void load()} />
                ))}
              </Section>

              <Section title="Upcoming" tone="plain" icon={CalendarClock} count={upcoming.length}
                hint="The next 7 days." emptyText="Nothing scheduled in the next 7 days.">
                {upcoming.map(task => (
                  <TaskRow key={task.id} task={task} zone={zone} today={today} now={now}
                    scope={scope} assignees={assignees} accent="plain"
                    onComplete={() => void complete(task)}
                    onPatch={patchTask} onSaved={() => void load()} />
                ))}
              </Section>

              <Section title="Unscheduled" tone="plain" icon={ListTodo} count={unscheduled.length}
                hint="No due date yet — give them one so they surface on the day." emptyText="Everything open has a date.">
                {unscheduled.map(task => (
                  <TaskRow key={task.id} task={task} zone={zone} today={today} now={now}
                    scope={scope} assignees={assignees} accent="plain"
                    onComplete={() => void complete(task)}
                    onPatch={patchTask} onSaved={() => void load()} />
                ))}
              </Section>
            </div>
          </>
        )}

        {/* Notifications */}
        <NotificationsPanel
          notifications={notifications}
          unread={unread}
          available={notifAvailable}
          loading={notifLoading}
          error={notifError}
          now={now}
          onReload={() => void loadNotifications()}
          onOpen={(n) => {
            if (!n.readAt) {
              void adminFetch("/api/crm/notifications/read", {
                method: "POST", body: JSON.stringify({ ids: [n.id] }),
              }).then(() => loadNotifications());
            }
            if (n.href && n.href.startsWith("/")) navigate(n.href);
          }}
          onMarkAll={async () => {
            await adminFetch("/api/crm/notifications/read", { method: "POST", body: JSON.stringify({}) });
            await loadNotifications();
          }}
        />

        {/* Reminder settings */}
        <ReminderSettings zone={data?.timezone ?? zone} hasAccount={!!data?.signedInAs} onSaved={() => void load()} />
      </div>
    </CrmLayout>
  );
}

// ── Helpers used by the page ─────────────────────────────────────────────────

function byDueDateAsc(a: DayTask, b: DayTask): number {
  const x = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const y = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  return x - y;
}

/** Optimistic removal: drop a task from every bucket and fix the counts. */
function withoutTask(payload: MyDayPayload, id: number): MyDayPayload {
  const drop = (rows: DayTask[]) => rows.filter(t => t.id !== id);
  const overdue = drop(payload.overdue);
  const dueToday = drop(payload.dueToday);
  const upcoming = drop(payload.upcoming);
  const blocked = drop(payload.blocked);
  const unscheduled = drop(payload.unscheduled);
  return {
    ...payload,
    overdue, dueToday, upcoming, blocked, unscheduled,
    counts: {
      ...payload.counts,
      overdue: overdue.length,
      dueToday: dueToday.length,
      upcoming: upcoming.length,
      blocked: blocked.length,
      unscheduled: unscheduled.length,
    },
  };
}

// ── Section ──────────────────────────────────────────────────────────────────

function Section({
  title, hint, count, tone, icon: Icon, emptyText, children,
}: {
  title: string;
  hint: string;
  count: number;
  tone: "urgent" | "warm" | "plain";
  icon: React.ElementType;
  emptyText: string;
  children: React.ReactNode;
}) {
  // Empty sections collapse themselves so the day reads as the work that is
  // actually there; they can still be opened to confirm they are empty.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? count > 0;

  const iconTone = tone === "urgent" ? "text-red-600" : tone === "warm" ? "text-amber-600" : "text-teal-700";
  const edge = tone === "urgent" && count > 0 ? "border-l-2 border-l-red-400" : "";

  return (
    <section className={`rounded-xl border border-border bg-white overflow-hidden ${edge}`}>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 sm:px-4 py-3 text-left hover:bg-accent/60 transition-colors"
      >
        <Icon className={`w-4 h-4 shrink-0 ${count > 0 ? iconTone : "text-muted-foreground/60"}`} />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <CountBadge n={count} tone={tone} />
        <span className="hidden sm:inline text-[11px] text-muted-foreground truncate ml-1">{hint}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground ml-auto shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <div className="px-2 sm:px-3 pb-3 space-y-2">
          {count === 0
            ? <p className="text-xs text-muted-foreground px-2 py-3">{emptyText}</p>
            : children}
        </div>
      )}
    </section>
  );
}

// ── Task row + inline editor ─────────────────────────────────────────────────

type EditorValues = {
  dueDate: string; remindAt: string; priority: string;
  assignedToStaffId: string; blockedReason: string;
};

/** Explicit per-field copy — no computed keys, so the shape stays checked. */
function withField(values: EditorValues, field: keyof EditorValues, raw: string): EditorValues {
  switch (field) {
    case "dueDate": return { ...values, dueDate: raw };
    case "remindAt": return { ...values, remindAt: raw };
    case "priority": return { ...values, priority: raw };
    case "assignedToStaffId": return { ...values, assignedToStaffId: raw };
    default: return { ...values, blockedReason: raw };
  }
}

function seedValues(task: DayTask, zone: string): EditorValues {
  return {
    dueDate: toInputValue(task.dueDate, zone),
    remindAt: toInputValue(task.remindAt, zone),
    priority: task.priority ?? "",
    assignedToStaffId: task.assignedToStaffId != null ? String(task.assignedToStaffId) : "",
    blockedReason: task.blockedReason ?? "",
  };
}

function TaskRow({
  task, zone, today, now, scope, assignees, accent, onComplete, onPatch, onSaved,
}: {
  task: DayTask;
  zone: string;
  today: Date;
  now: number;
  scope: Scope;
  assignees: Assignee[];
  accent: "urgent" | "warm" | "plain";
  onComplete: () => void;
  onPatch: (id: number, body: Record<string, unknown>) => Promise<{ ok: true; task?: DayTask } | { ok: false; error: string }>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EditorValues>(() => seedValues(task, zone));
  const [base, setBase] = useState<EditorValues>(() => seedValues(task, zone));
  const [savingField, setSavingField] = useState<keyof EditorValues | null>(null);
  const [savedField, setSavedField] = useState<keyof EditorValues | null>(null);
  const [rowError, setRowError] = useState("");

  const late = accent === "urgent" ? daysLate(task.dueDate, new Date(now)) : 0;
  const done = task.checklist?.filter(c => c.done).length ?? 0;
  const steps = task.checklist?.length ?? 0;

  function openEditor() {
    if (!open) {
      const seeded = seedValues(task, zone);
      setValues(seeded);
      setBase(seeded);
      setRowError("");
    }
    setOpen(o => !o);
  }

  async function save(field: keyof EditorValues, raw: string) {
    if (raw === base[field]) return;          // nothing actually changed
    if (savingField === field) return;        // a commit for this field is already in flight
    // Never send an empty assignee: the API coerces a null id to 0, which is
    // nobody. Unassigning is not offered here for exactly that reason.
    if (field === "assignedToStaffId" && !raw) {
      setValues(v => withField(v, field, base.assignedToStaffId));
      return;
    }
    setSavingField(field);
    setRowError("");

    const body: Record<string, unknown> =
      field === "dueDate" || field === "remindAt"
        ? { [field]: raw ? fromInputValue(raw, zone) : null }
        : field === "priority" ? { priority: raw || null }
        : field === "assignedToStaffId" ? { assignedToStaffId: raw ? Number(raw) : null }
        : { blockedReason: raw };

    const res = await onPatch(task.id, body);
    setSavingField(null);

    if (!res.ok) {
      setValues(v => withField(v, field, base[field]));   // refused — show the truth
      setRowError(res.error);
      return;
    }
    const seeded = res.task ? seedValues(res.task, zone) : withField(values, field, raw);
    setValues(seeded);
    setBase(seeded);
    setSavedField(field);
    window.setTimeout(() => setSavedField(null), 1800);
    onSaved();
  }

  /**
   * A half-typed date reads back as an empty string, which would otherwise
   * save as "no date" and quietly lose the one that was there. The browser
   * flags that case as `badInput`, so put the stored value back instead.
   */
  async function commitDate(field: "dueDate" | "remindAt", el: HTMLInputElement) {
    if (el.validity.badInput) {
      setValues(v => withField(v, field, base[field]));
      setRowError("That date could not be read, so it was left as it was.");
      return;
    }
    await save(field, el.value);
  }

  const edge = accent === "urgent" ? "border-red-200" : accent === "warm" ? "border-amber-200" : "border-border";

  return (
    <div className={`rounded-lg border bg-white ${edge}`}>
      <div className="flex items-start gap-2.5 p-3">
        <button
          type="button"
          onClick={onComplete}
          aria-label={`Mark "${task.title}" complete`}
          title="Mark complete"
          className="group mt-0.5 w-5 h-5 rounded border-2 border-input hover:border-green-500 hover:bg-green-50 flex items-center justify-center shrink-0 transition-colors"
        >
          <Check className="w-3 h-3 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={openEditor}
            aria-expanded={open}
            className="w-full text-left group"
          >
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors break-words">
                {task.title}
              </span>
              <PriorityPill priority={task.priority} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {task.dueDate ? (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${
                  accent === "urgent" ? "text-red-600" : "text-muted-foreground"
                }`}>
                  <Clock className="w-3 h-3" />
                  {formatWhen(task.dueDate, zone, today)}
                  {late > 0 && ` · ${late}d late`}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">No due date</span>
              )}
              {task.remindAt && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                  <Bell className="w-3 h-3" /> {formatWhen(task.remindAt, zone, today)}
                </span>
              )}
              {task.type && <span className="text-[11px] text-muted-foreground">{task.type}</span>}
              {steps > 0 && (
                <span className="text-[11px] text-muted-foreground tabular-nums">{done}/{steps} steps</span>
              )}
              {scope === "team" && (
                <span className="text-[11px] text-muted-foreground">
                  {task.assigneeName ?? "Unassigned"}
                </span>
              )}
            </div>
          </button>

          {/* Links live outside the disclosure button so they stay real links. */}
          <div className="flex items-center gap-3 flex-wrap mt-1">
            {task.lead && (
              <Link href={`/admin/crm/leads/${task.lead.id}`}
                className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline">
                {task.lead.name}{task.lead.company ? ` — ${task.lead.company}` : ""}
                <ChevronRight className="w-3 h-3" />
              </Link>
            )}
            {task.project && (
              <Link href="/admin/crm/projects"
                className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline">
                {task.project.name}{task.project.stage ? ` · ${task.project.stage}` : ""}
                <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {task.blockedReason && (
            <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Waiting: {task.blockedReason}
            </p>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </div>

      {open && (
        <div className="border-t border-border px-3 py-3 bg-muted/40">
          {task.description && (
            <p className="text-xs text-muted-foreground mb-3 whitespace-pre-wrap">{task.description}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                Due <SaveHint field="dueDate" saving={savingField} saved={savedField} />
              </FieldLabel>
              <input
                type="datetime-local"
                className={INPUT}
                value={values.dueDate}
                disabled={savingField === "dueDate"}
                onChange={e => setValues(v => withField(v, "dueDate", e.target.value))}
                onBlur={e => void commitDate("dueDate", e.target)}
                onKeyDown={e => { if (e.key === "Enter") void commitDate("dueDate", e.currentTarget); }}
              />
            </div>

            <div>
              <FieldLabel>
                Reminder <SaveHint field="remindAt" saving={savingField} saved={savedField} />
              </FieldLabel>
              <input
                type="datetime-local"
                className={INPUT}
                value={values.remindAt}
                disabled={savingField === "remindAt"}
                onChange={e => setValues(v => withField(v, "remindAt", e.target.value))}
                onBlur={e => void commitDate("remindAt", e.target)}
                onKeyDown={e => { if (e.key === "Enter") void commitDate("remindAt", e.currentTarget); }}
              />
            </div>

            <div>
              <FieldLabel>
                Priority <SaveHint field="priority" saving={savingField} saved={savedField} />
              </FieldLabel>
              <select
                className={INPUT}
                value={values.priority}
                disabled={savingField === "priority"}
                onChange={e => {
                  const next = e.target.value;
                  setValues(v => ({ ...v, priority: next }));
                  void save("priority", next);
                }}
              >
                <option value="">Not set</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div>
              <FieldLabel>
                Assignee <SaveHint field="assignedToStaffId" saving={savingField} saved={savedField} />
              </FieldLabel>
              <select
                className={INPUT}
                value={values.assignedToStaffId}
                disabled={savingField === "assignedToStaffId"}
                onChange={e => {
                  const next = e.target.value;
                  setValues(v => ({ ...v, assignedToStaffId: next }));
                  void save("assignedToStaffId", next);
                }}
              >
                <option value="" disabled>Unassigned</option>
                {assignees.map(a => (
                  <option key={a.id} value={String(a.id)}>{a.displayName}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <FieldLabel>
                Blocked because <SaveHint field="blockedReason" saving={savingField} saved={savedField} />
              </FieldLabel>
              <input
                type="text"
                className={INPUT}
                placeholder="Leave empty if nothing is blocking it"
                value={values.blockedReason}
                disabled={savingField === "blockedReason"}
                onChange={e => setValues(v => ({ ...v, blockedReason: e.target.value }))}
                onBlur={e => void save("blockedReason", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void save("blockedReason", values.blockedReason); }}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-2">
            Each field saves on its own as soon as you leave it.
          </p>

          {rowError && (
            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{rowError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function SaveHint({ field, saving, saved }: {
  field: keyof EditorValues;
  saving: keyof EditorValues | null;
  saved: keyof EditorValues | null;
}) {
  if (saving === field) return <span className="ml-1 font-normal text-muted-foreground">saving…</span>;
  if (saved === field) return <span className="ml-1 font-normal text-green-600">saved</span>;
  return null;
}

// ── Add task ─────────────────────────────────────────────────────────────────

function AddTaskComposer({ zone, assignees, signedInId, onCreated }: {
  zone: string;
  assignees: Assignee[];
  signedInId: number | null;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function create() {
    if (title.trim().length < 2) { setError("Give the task a title."); return; }
    setBusy(true);
    setError("");
    setOk("");
    const body: Record<string, unknown> = {
      title: title.trim(),
      dueDate: dueDate ? fromInputValue(dueDate, zone) : null,
      remindAt: remindAt ? fromInputValue(remindAt, zone) : null,
      priority: priority || null,
    };
    if (assignedTo) body["assignedToStaffId"] = Number(assignedTo);
    else if (signedInId != null) body["assignedToStaffId"] = signedInId;

    const r = await adminFetch("/api/crm/operations/tasks", { method: "POST", body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({})) as { error?: string; permission?: string };
    setBusy(false);

    if (!r.ok) {
      const message = d.error ?? "That task could not be created.";
      setError(d.permission === "tasks.assign"
        ? `${message} Choose yourself as the assignee.`
        : message);
      return;
    }
    setTitle(""); setDueDate(""); setRemindAt(""); setPriority("Medium"); setAssignedTo("");
    setOk("Task added.");
    window.setTimeout(() => setOk(""), 2500);
    onCreated();
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3 sm:p-4 mb-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Plus className="w-4 h-4 text-teal-700" />
        <h2 className="text-sm font-semibold text-foreground">Add task</h2>
      </div>

      <input
        className={INPUT}
        placeholder="What needs doing?"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && title.trim().length >= 2 && !busy) void create(); }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div>
          <FieldLabel>Due (optional)</FieldLabel>
          <input type="datetime-local" className={INPUT} value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Reminder (optional)</FieldLabel>
          <input type="datetime-local" className={INPUT} value={remindAt} onChange={e => setRemindAt(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Priority</FieldLabel>
          <select className={INPUT} value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="">Not set</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div>
          <FieldLabel>Assignee</FieldLabel>
          <select className={INPUT} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
            <option value="">{signedInId != null ? "Me" : "Unassigned"}</option>
            {assignees.map(a => <option key={a.id} value={String(a.id)}>{a.displayName}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>
      )}
      {ok && (
        <p className="mt-2.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">{ok}</p>
      )}

      <div className="flex justify-end mt-3">
        <Button size="sm" className="gap-1.5" disabled={busy || title.trim().length < 2} onClick={() => void create()}>
          <Plus className="w-3.5 h-3.5" /> {busy ? "Adding…" : "Add task"}
        </Button>
      </div>
    </div>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

function NotificationsPanel({
  notifications, unread, available, loading, error, now, onOpen, onMarkAll, onReload,
}: {
  notifications: AppNotification[];
  unread: number;
  available: boolean;
  loading: boolean;
  error: string;
  now: number;
  onOpen: (n: AppNotification) => void;
  onMarkAll: () => Promise<void>;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-white mt-4 overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 sm:px-4 py-3 border-b border-border">
        <Bell className={`w-4 h-4 shrink-0 ${unread > 0 ? "text-amber-600" : "text-muted-foreground/60"}`} />
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        <span className={`tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
          unread > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
        }`}>
          {unread}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {available && unread > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => { setBusy(true); void onMarkAll().finally(() => setBusy(false)); }}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {busy ? "Marking…" : "Mark all read"}
            </button>
          )}
          <button type="button" onClick={onReload} className="text-muted-foreground hover:text-foreground" aria-label="Reload notifications">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!available ? (
        <p className="px-4 py-5 text-xs text-muted-foreground">
          This session is signed in with the shared admin password rather than a personal account,
          so there is nobody to notify. Sign in with your own account to see notifications here.
        </p>
      ) : error ? (
        <div className="px-4 py-5 text-center">
          <p className="text-xs text-red-700">{error}</p>
          <Button size="sm" variant="outline" className="mt-2.5 gap-1.5" onClick={onReload}>
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="p-3 space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : notifications.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">Nothing to catch up on.</p>
      ) : (
        <ul className="divide-y divide-border">
          {notifications.map(n => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onOpen(n)}
                className={`w-full text-left flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-accent/60 transition-colors ${
                  n.readAt ? "" : "bg-amber-50/50"
                }`}
              >
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.readAt ? "bg-border" : "bg-amber-500"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground break-words">{n.title}</span>
                  {n.body && <span className="block text-xs text-muted-foreground mt-0.5 break-words">{n.body}</span>}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {relativeTime(n.createdAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Reminder settings ────────────────────────────────────────────────────────

function ReminderSettings({ zone, hasAccount, onSaved }: {
  zone: string;
  hasAccount: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [timezone, setTimezone] = useState(zone);
  const [touchedZone, setTouchedZone] = useState(false);
  const [emailReminders, setEmailReminders] = useState(true);
  const [digest, setDigest] = useState(false);
  const [digestHour, setDigestHour] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState("");

  // Follow the server's timezone until the person edits the box themselves.
  useEffect(() => { if (!touchedZone) setTimezone(zone); }, [zone, touchedZone]);

  async function save() {
    if (!isKnownZone(timezone.trim())) {
      setError('That timezone is not recognised. Use an IANA name such as "Europe/London".');
      return;
    }
    setBusy(true);
    setError("");
    setConfirmed("");
    const r = await adminFetch("/api/crm/operations/reminder-preferences", {
      method: "PATCH",
      body: JSON.stringify({
        timezone: timezone.trim(),
        reminderEmailEnabled: emailReminders,
        dailyDigestEnabled: digest,
        dailyDigestHour: digestHour,
      }),
    });
    const d = await r.json().catch(() => ({})) as {
      error?: string; timezone?: string; reminderEmailEnabled?: boolean;
      dailyDigestEnabled?: boolean; dailyDigestHour?: number;
    };
    setBusy(false);

    if (!r.ok) { setError(d.error ?? "Those settings could not be saved."); return; }

    // Show back exactly what the server stored, not what was typed.
    if (d.timezone) { setTimezone(d.timezone); setTouchedZone(true); }
    if (typeof d.reminderEmailEnabled === "boolean") setEmailReminders(d.reminderEmailEnabled);
    if (typeof d.dailyDigestEnabled === "boolean") setDigest(d.dailyDigestEnabled);
    if (typeof d.dailyDigestHour === "number") setDigestHour(d.dailyDigestHour);
    setConfirmed(
      `Saved — ${d.timezone ?? timezone}, email reminders ${d.reminderEmailEnabled ? "on" : "off"}, ` +
      `daily digest ${d.dailyDigestEnabled ? `at ${String(d.dailyDigestHour ?? digestHour).padStart(2, "0")}:00` : "off"}.`,
    );
    onSaved();
  }

  return (
    <section className="rounded-xl border border-border bg-white mt-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 sm:px-4 py-3 text-left hover:bg-accent/60 transition-colors"
      >
        <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold text-foreground">Reminder settings</span>
        <span className="hidden sm:inline text-[11px] text-muted-foreground truncate ml-1">
          Timezone, reminder emails and the daily digest.
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground ml-auto shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-4 pt-1">
          {!hasAccount && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-3">
              These settings belong to a personal account. Sign in with your own account to change them.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <FieldLabel>Timezone</FieldLabel>
              <input
                type="text"
                className={INPUT}
                value={timezone}
                placeholder="Europe/London"
                disabled={!hasAccount}
                onChange={e => { setTouchedZone(true); setTimezone(e.target.value); }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Due dates, reminders and the digest all fire in this timezone.
              </p>
            </div>

            <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-teal-600"
                checked={emailReminders}
                disabled={!hasAccount}
                onChange={e => setEmailReminders(e.target.checked)}
              />
              <span className="text-sm text-foreground">Email me task reminders</span>
            </label>

            <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-teal-600"
                checked={digest}
                disabled={!hasAccount}
                onChange={e => setDigest(e.target.checked)}
              />
              <span className="text-sm text-foreground">Send me a daily digest</span>
            </label>

            <div>
              <FieldLabel>Digest hour</FieldLabel>
              <select
                className={INPUT}
                value={String(digestHour)}
                disabled={!hasAccount || !digest}
                onChange={e => setDigestHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>
          )}
          {confirmed && (
            <p className="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">{confirmed}</p>
          )}

          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <p className="text-[11px] text-muted-foreground max-w-sm">
              The timezone above is the one the server holds for you. The two switches can be set
              here but not read back, so they start at their defaults — saving shows exactly what
              the server stored.
            </p>
            <Button size="sm" disabled={busy || !hasAccount} onClick={() => void save()}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function DaySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading your day">
      {[0, 1, 2].map(section => (
        <div key={section} className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-4 h-4 rounded bg-muted animate-pulse" />
            <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
            <div className="h-4 w-6 rounded-full bg-muted animate-pulse" />
          </div>
          <div className="space-y-2">
            {[0, 1].map(row => (
              <div key={row} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
