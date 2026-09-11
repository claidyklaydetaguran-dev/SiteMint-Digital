// ── M3: the internal team calendar ──────────────────────────────────────────
//
// The agency's own diary — deliberately NOT the receptionist product's
// `scheduling_*` tables, which hold a customer's bookings and are not this
// team's appointments.
//
// Internal operations only. Two-way synchronisation with Google or Outlook is
// a separate, provider-dependent capability: an exported .ics file is a
// download, not a sync, and this file never pretends otherwise.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  db, crmAppointments, crmAppointmentAttendees, crmStaff, crmLeads, crmProjects,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { scheduleJob, cancelJob, isValidTimezone } from "../lib/crmScheduler.js";

const router: IRouter = Router();

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function actor(req: Request) {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName ?? s?.email ?? "admin", timezone: s?.timezone ?? "UTC" };
}

const appointmentReminderKey = (id: number) => `appointment_reminder:${id}`;

function parseInstant(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/**
 * Keeps an appointment's reminder in step with its current state. Cancelling,
 * completing, moving or clearing the lead time all route through here, so a
 * cancelled meeting can never still ping somebody.
 */
async function syncAppointmentReminder(appointmentId: number): Promise<void> {
  const [appt] = await db.select().from(crmAppointments)
    .where(eq(crmAppointments.id, appointmentId)).limit(1);
  if (!appt) { await cancelJob(appointmentReminderKey(appointmentId)); return; }

  const lead = appt.reminderMinutesBefore;
  const target = lead != null ? new Date(appt.startAt.getTime() - lead * 60_000) : null;
  const live = appt.status === "scheduled"
    && target != null
    && target.getTime() > Date.now() - 24 * 3600_000;

  if (!live) { await cancelJob(appointmentReminderKey(appointmentId)); return; }
  await scheduleJob({
    kind: "appointment_reminder",
    dedupeKey: appointmentReminderKey(appointmentId),
    runAt: target!,
    payload: { appointmentId },
  });
}

async function attendeesFor(ids: number[]) {
  if (ids.length === 0) return new Map<number, unknown[]>();
  const rows = await db.select().from(crmAppointmentAttendees)
    .where(inArray(crmAppointmentAttendees.appointmentId, ids));
  const staffIds = [...new Set(rows.map((r) => r.staffId).filter((v): v is number => v != null))];
  const people = staffIds.length
    ? await db.select({ id: crmStaff.id, displayName: crmStaff.displayName, email: crmStaff.email })
        .from(crmStaff).where(inArray(crmStaff.id, staffIds))
    : [];
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const out = new Map<number, unknown[]>();
  for (const r of rows) {
    const list = out.get(r.appointmentId) ?? [];
    list.push({
      id: r.id,
      staffId: r.staffId,
      name: r.staffId ? peopleMap.get(r.staffId)?.displayName ?? null : r.externalName,
      email: r.staffId ? peopleMap.get(r.staffId)?.email ?? null : r.externalEmail,
      external: r.staffId == null,
      responseStatus: r.responseStatus,
    });
    out.set(r.appointmentId, list);
  }
  return out;
}

// ── Listing ─────────────────────────────────────────────────────────────────

router.get("/crm/appointments", requireCrmAuth(), async (req: Request, res: Response) => {
  const me = actor(req);
  const scope = req.query["scope"] === "team" ? "team" : "mine";
  if (scope === "team" && !req.staffAuth?.permissions.has("tasks.read.team")) {
    res.status(403).json({ error: "Seeing the team calendar needs the team-read permission.", permission: "tasks.read.team" });
    return;
  }

  const from = parseInstant(req.query["from"]) ?? new Date(Date.now() - 7 * 864e5);
  const to = parseInstant(req.query["to"]) ?? new Date(Date.now() + 60 * 864e5);
  const includeCancelled = req.query["includeCancelled"] === "true";

  // "Mine" means organised by me OR I am an attendee — being invited to a
  // meeting is exactly as much a claim on my day as having called it.
  let mineIds: number[] = [];
  if (scope === "mine" && me.id) {
    const rows = await db.select({ appointmentId: crmAppointmentAttendees.appointmentId })
      .from(crmAppointmentAttendees).where(eq(crmAppointmentAttendees.staffId, me.id));
    mineIds = rows.map((r) => r.appointmentId);
  }

  const where = [
    gte(crmAppointments.startAt, from),
    lte(crmAppointments.startAt, to),
    ...(includeCancelled ? [] : [ne(crmAppointments.status, "cancelled")]),
    ...(scope === "mine" && me.id
      ? [or(
          eq(crmAppointments.organizerStaffId, me.id),
          ...(mineIds.length ? [inArray(crmAppointments.id, mineIds)] : []),
        )!]
      : []),
  ];

  const rows = await db.select().from(crmAppointments).where(and(...where))
    .orderBy(asc(crmAppointments.startAt)).limit(500);

  const attendeeMap = await attendeesFor(rows.map((r) => r.id));
  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((v): v is number => v != null))];
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((v): v is number => v != null))];
  const [leads, projects] = await Promise.all([
    leadIds.length ? db.select({ id: crmLeads.id, name: crmLeads.name, company: crmLeads.company })
      .from(crmLeads).where(inArray(crmLeads.id, leadIds)) : [],
    projectIds.length ? db.select({ id: crmProjects.id, name: crmProjects.name })
      .from(crmProjects).where(inArray(crmProjects.id, projectIds)) : [],
  ]);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  res.json({
    scope,
    viewerTimezone: me.timezone,
    from: from.toISOString(), to: to.toISOString(),
    appointments: rows.map((a) => ({
      ...a,
      attendees: attendeeMap.get(a.id) ?? [],
      lead: a.leadId ? leadMap.get(a.leadId) ?? null : null,
      project: a.projectId ? projectMap.get(a.projectId) ?? null : null,
    })),
  });
});

// ── Create ──────────────────────────────────────────────────────────────────

router.post("/crm/appointments", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const me = actor(req);
  const title = typeof b["title"] === "string" ? b["title"].trim() : "";
  const startAt = parseInstant(b["startAt"]);
  const endAt = parseInstant(b["endAt"]);

  if (title.length < 2) { res.status(400).json({ error: "Give the appointment a title." }); return; }
  if (!startAt) { res.status(400).json({ error: "Invalid start time." }); return; }
  if (!endAt) { res.status(400).json({ error: "Invalid end time." }); return; }
  if (endAt.getTime() < startAt.getTime()) {
    res.status(400).json({ error: "It cannot end before it starts." }); return;
  }

  const timezone = typeof b["timezone"] === "string" && isValidTimezone(b["timezone"])
    ? b["timezone"] : me.timezone;

  const [appointment] = await db.insert(crmAppointments).values({
    title,
    description: typeof b["description"] === "string" ? b["description"] : null,
    startAt, endAt,
    allDay: b["allDay"] === true,
    timezone,
    location: typeof b["location"] === "string" ? b["location"] : null,
    meetingUrl: typeof b["meetingUrl"] === "string" ? b["meetingUrl"] : null,
    leadId: num(b["leadId"]) ?? null,
    projectId: num(b["projectId"]) ?? null,
    dealId: num(b["dealId"]) ?? null,
    organizerStaffId: num(b["organizerStaffId"]) ?? me.id,
    createdByStaffId: me.id,
    createdByLabel: me.label,
    reminderMinutesBefore: num(b["reminderMinutesBefore"]) ?? null,
  }).returning();

  // The organiser always attends their own meeting.
  const staffAttendees = new Set<number>(
    (Array.isArray(b["attendeeStaffIds"]) ? b["attendeeStaffIds"] : [])
      .map(Number).filter(Number.isFinite),
  );
  if (appointment.organizerStaffId) staffAttendees.add(appointment.organizerStaffId);
  if (staffAttendees.size > 0) {
    await db.insert(crmAppointmentAttendees).values(
      [...staffAttendees].map((staffId) => ({ appointmentId: appointment.id, staffId })),
    ).onConflictDoNothing();
  }

  const external = Array.isArray(b["externalAttendees"]) ? b["externalAttendees"] : [];
  const externalRows = external
    .filter((e): e is { email: string; name?: string } =>
      !!e && typeof (e as { email?: unknown }).email === "string")
    .map((e) => ({
      appointmentId: appointment.id,
      externalEmail: e.email, externalName: e.name ?? null,
    }));
  if (externalRows.length) await db.insert(crmAppointmentAttendees).values(externalRows);

  await syncAppointmentReminder(appointment.id);
  await auditAction(req, "appointment.created", `appointment:${appointment.id} ${title}`);

  res.status(201).json({
    appointment,
    // Invitations are not emailed: no attendee mail flow exists yet, and
    // claiming somebody was invited when nothing was sent would be worse than
    // saying so.
    invitationsSent: false,
    invitationNote: "Attendees are recorded here. No invitation email was sent — attendee mail is not built yet.",
  });
});

// ── Update, reschedule, cancel, complete ────────────────────────────────────

router.patch("/crm/appointments/:id", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [existing] = await db.select().from(crmAppointments).where(eq(crmAppointments.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found." }); return; }

  const b = req.body as Record<string, unknown>;
  const me = actor(req);
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof b["title"] === "string" && b["title"].trim().length >= 2) updates["title"] = b["title"].trim();
  for (const f of ["description", "location", "meetingUrl"] as const) {
    if (f in b) updates[f] = typeof b[f] === "string" && b[f] !== "" ? b[f] : null;
  }
  if ("allDay" in b) updates["allDay"] = b["allDay"] === true;
  if (typeof b["timezone"] === "string") {
    if (!isValidTimezone(b["timezone"])) { res.status(400).json({ error: "Unknown timezone." }); return; }
    updates["timezone"] = b["timezone"];
  }
  if ("leadId" in b) updates["leadId"] = b["leadId"] === null ? null : num(b["leadId"]) ?? null;
  if ("projectId" in b) updates["projectId"] = b["projectId"] === null ? null : num(b["projectId"]) ?? null;
  if ("organizerStaffId" in b) updates["organizerStaffId"] = b["organizerStaffId"] === null ? null : num(b["organizerStaffId"]) ?? null;
  if ("reminderMinutesBefore" in b) {
    updates["reminderMinutesBefore"] = b["reminderMinutesBefore"] === null
      ? null : num(b["reminderMinutesBefore"]) ?? null;
  }

  // Rescheduling: both ends move together and are validated as a pair, so a
  // partial update cannot leave an appointment ending before it starts.
  const nextStart = "startAt" in b ? parseInstant(b["startAt"]) : existing.startAt;
  const nextEnd = "endAt" in b ? parseInstant(b["endAt"]) : existing.endAt;
  if (("startAt" in b && !nextStart) || ("endAt" in b && !nextEnd)) {
    res.status(400).json({ error: "Invalid time." }); return;
  }
  if (nextEnd!.getTime() < nextStart!.getTime()) {
    res.status(400).json({ error: "It cannot end before it starts." }); return;
  }
  if ("startAt" in b) updates["startAt"] = nextStart;
  if ("endAt" in b) updates["endAt"] = nextEnd;

  if (typeof b["status"] === "string") {
    if (!["scheduled", "cancelled", "completed"].includes(b["status"])) {
      res.status(400).json({ error: "Unknown status." }); return;
    }
    updates["status"] = b["status"];
    if (b["status"] === "cancelled") {
      updates["cancelledAt"] = new Date();
      updates["cancelledByStaffId"] = me.id;
      updates["cancelReason"] = typeof b["cancelReason"] === "string" ? b["cancelReason"] : null;
    } else {
      updates["cancelledAt"] = null; updates["cancelledByStaffId"] = null; updates["cancelReason"] = null;
    }
    updates["completedAt"] = b["status"] === "completed" ? new Date() : null;
  }

  const [appointment] = await db.update(crmAppointments).set(updates)
    .where(eq(crmAppointments.id, id)).returning();

  if (Array.isArray(b["attendeeStaffIds"])) {
    const wanted = new Set<number>((b["attendeeStaffIds"] as unknown[]).map(Number).filter(Number.isFinite));
    if (appointment.organizerStaffId) wanted.add(appointment.organizerStaffId);
    await db.delete(crmAppointmentAttendees).where(and(
      eq(crmAppointmentAttendees.appointmentId, id),
      isNull(crmAppointmentAttendees.externalEmail),
    ));
    if (wanted.size) {
      await db.insert(crmAppointmentAttendees)
        .values([...wanted].map((staffId) => ({ appointmentId: id, staffId })))
        .onConflictDoNothing();
    }
  }

  // Any of: moved, cancelled, completed, reminder-changed.
  await syncAppointmentReminder(id);
  if (updates["status"]) await auditAction(req, `appointment.${String(updates["status"])}`, `appointment:${id}`);

  res.json({ appointment });
});

router.delete("/crm/appointments/:id", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  // Cancel rather than delete: a meeting that happened (or was called off)
  // is part of the client's history.
  const [appointment] = await db.update(crmAppointments).set({
    status: "cancelled", cancelledAt: new Date(),
    cancelledByStaffId: actor(req).id, updatedAt: new Date(),
  }).where(eq(crmAppointments.id, id)).returning();
  if (!appointment) { res.status(404).json({ error: "Not found." }); return; }
  await cancelJob(appointmentReminderKey(id));
  await auditAction(req, "appointment.cancelled", `appointment:${id}`);
  res.json({ appointment });
});

/**
 * An .ics download of one appointment.
 *
 * This is an EXPORT, not synchronisation: importing it copies the event into
 * another calendar once, and later edits here will not follow it. Two-way sync
 * needs a provider integration that does not exist yet.
 */
router.get("/crm/appointments/:id/ics", requireCrmAuth(), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [a] = await db.select().from(crmAppointments).where(eq(crmAppointments.id, id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found." }); return; }

  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SiteMint Digital//CRM//EN",
    "BEGIN:VEVENT",
    `UID:sitemint-crm-appointment-${a.id}@sitemintdigital.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(a.startAt)}`,
    `DTEND:${stamp(a.endAt)}`,
    `SUMMARY:${esc(a.title)}`,
    ...(a.description ? [`DESCRIPTION:${esc(a.description)}`] : []),
    ...(a.location ? [`LOCATION:${esc(a.location)}`] : []),
    `STATUS:${a.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="appointment-${a.id}.ics"`);
  res.send(ics);
});

export default router;
