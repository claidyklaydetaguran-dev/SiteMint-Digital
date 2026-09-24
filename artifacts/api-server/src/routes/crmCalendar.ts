// ── M3: the internal team calendar ──────────────────────────────────────────
//
// The agency's own diary — deliberately NOT the receptionist product's
// `scheduling_*` tables, which hold a customer's bookings and are not this
// team's appointments.
//
// Internal operations only. Two-way synchronisation with Google or Outlook is
// a separate, provider-dependent capability: an exported .ics file is a
// download, not a sync, and this file never pretends otherwise.
//
// M4 adds attendee invitations. What that does and does not mean:
//
//   DOES — each attendee is emailed an iCalendar message (METHOD:REQUEST) so
//   their own mail client offers to add the meeting. Rescheduling sends the
//   same UID with a higher SEQUENCE, so their calendar REPLACES the entry
//   instead of collecting duplicates; cancelling sends METHOD:CANCEL, so it
//   disappears rather than lingering.
//
//   DOES NOT — synchronise. We still learn nothing about their calendar, and
//   nothing ingests an RSVP: `responseStatus` remains what staff recorded.
//
// Every response reports what the mail seam actually said, in the seam's own
// four words (`not_configured` | `rejected` | `failed` | `uncertain`) plus
// `sent`. `invitationsSent` stays exactly as honest as it was when the answer
// was always `false`: it is true only when every message was accepted.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  db, crmAppointments, crmAppointmentAttendees, crmStaff, crmLeads, crmProjects,
  type CrmAppointment, type CrmAppointmentAttendee,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { scheduleJob, cancelJob, isValidTimezone } from "../lib/crmScheduler.js";
import {
  attendeeRowsFor, buildAppointmentIcs, bumpSequence, materialChange,
  nothingToSend, organizerAddress, sendAppointmentInvitations,
  type AppointmentSnapshot, type InvitationReport,
} from "../lib/crmAppointmentInvites.js";

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
      // What the mail seam said last time, verbatim. `null` means no
      // invitation has ever been attempted for this person — which is a
      // different fact from one that was attempted and refused.
      invitation: {
        outcome: r.invitationOutcome,
        reason: r.invitationReason,
        method: r.invitationMethod,
        sequence: r.invitationSequence,
        at: r.invitationAt?.toISOString() ?? null,
      },
    });
    out.set(r.appointmentId, list);
  }
  return out;
}

/** The fields `materialChange` compares, lifted off a row. */
function snapshot(a: CrmAppointment): AppointmentSnapshot {
  return {
    startAt: a.startAt, endAt: a.endAt, allDay: a.allDay, title: a.title,
    location: a.location, meetingUrl: a.meetingUrl,
    organizerStaffId: a.organizerStaffId, status: a.status,
  };
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

  // The invitation and the reminder are different messages doing different
  // jobs: this one arrives now and asks a calendar to hold the slot, the
  // reminder arrives shortly before and asks a person to turn up. Neither
  // stands in for the other, so creating an appointment produces exactly one
  // of each, not two of either.
  const attendeeRows = await attendeeRowsFor(appointment.id);
  const invitations = await sendAppointmentInvitations({
    appointment,
    attendeeRows,
    method: "REQUEST",
    sequence: appointment.icalSequence,
    isUpdate: false,
    reasons: [],
  });

  await auditAction(
    req, "appointment.created",
    `appointment:${appointment.id} ${title} · invitations ${invitations.status}`,
  );

  res.status(201).json({
    appointment,
    // Kept exactly as honest as when this was hard-coded `false`: true ONLY
    // when the provider accepted every message. With no RESEND_API_KEY on this
    // server that is `false` with status `not_configured`, and the note says
    // so rather than implying anybody was told.
    invitationsSent: invitations.invitationsSent,
    invitationNote: invitations.note,
    invitations,
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

  const before = snapshot(existing);
  const [appointment] = await db.update(crmAppointments).set(updates)
    .where(eq(crmAppointments.id, id)).returning();

  // ── Attendees: a DIFF, not a rebuild ──────────────────────────────────────
  //
  // This used to delete every staff attendee row and re-insert the wanted set.
  // That was invisible while attendee rows held nothing but an id, and is not
  // any more: it would discard each person's recorded response AND the record
  // of what their invitation did, on every save, including saves that changed
  // nobody. Diffing keeps an unchanged attendee's row — and their history —
  // untouched, and it is also the only way to know who to tell.
  //
  // External attendees stay create-time-only here, exactly as before.
  const attendeesBefore = await attendeeRowsFor(id);
  let added: CrmAppointmentAttendee[] = [];
  let removed: CrmAppointmentAttendee[] = [];

  if (Array.isArray(b["attendeeStaffIds"])) {
    const wanted = new Set<number>((b["attendeeStaffIds"] as unknown[]).map(Number).filter(Number.isFinite));
    if (appointment.organizerStaffId) wanted.add(appointment.organizerStaffId);

    const currentStaff = attendeesBefore.filter((r) => r.staffId != null);
    const have = new Set(currentStaff.map((r) => r.staffId as number));

    removed = currentStaff.filter((r) => !wanted.has(r.staffId as number));
    if (removed.length) {
      await db.delete(crmAppointmentAttendees)
        .where(inArray(crmAppointmentAttendees.id, removed.map((r) => r.id)));
    }

    const toAdd = [...wanted].filter((staffId) => !have.has(staffId));
    if (toAdd.length) {
      added = await db.insert(crmAppointmentAttendees)
        .values(toAdd.map((staffId) => ({ appointmentId: id, staffId })))
        .onConflictDoNothing()
        .returning();
    }
  }

  // Any of: moved, cancelled, completed, reminder-changed.
  await syncAppointmentReminder(id);
  if (updates["status"]) await auditAction(req, `appointment.${String(updates["status"])}`, `appointment:${id}`);

  const invitations = await announceUpdate({
    appointment, before,
    added, removed,
    attendeesAfter: await attendeeRowsFor(id),
  });

  if (invitations.attempted > 0) {
    await auditAction(
      req, "appointment.attendees_notified",
      `appointment:${id} ${invitations.attempted} message(s) · ${invitations.status}`,
    );
  }

  res.json({
    appointment,
    invitationsSent: invitations.invitationsSent,
    invitationNote: invitations.note,
    invitations,
  });
});

/**
 * Decides who hears about an edit, and tells them once.
 *
 * The whole point of the `materialChange` split lives here: an edit that does
 * not change anybody's calendar entry sends NOTHING, and says so. An update
 * email is an interruption, and one sent because somebody fixed a typo in the
 * notes is how people learn to ignore the ones that move a meeting.
 */
async function announceUpdate(args: {
  appointment: CrmAppointment;
  before: AppointmentSnapshot;
  added: CrmAppointmentAttendee[];
  removed: CrmAppointmentAttendee[];
  attendeesAfter: CrmAppointmentAttendee[];
}): Promise<InvitationReport> {
  const { appointment, before, added, removed, attendeesAfter } = args;

  const verdict = materialChange(before, snapshot(appointment), {
    added: added.map((r) => String(r.id)),
    removed: removed.map((r) => String(r.id)),
  });
  if (!verdict.material) {
    return nothingToSend(
      "Nothing was emailed: this edit does not change anybody's calendar entry. "
      + "Attendees are told about the time, place, join link, title, organiser, "
      + "who is coming, and cancellation — not about notes or reminder settings.",
    );
  }

  // One bump per material edit, and the SAME number on every message it
  // produces — a calendar orders revisions by SEQUENCE, so a REQUEST and the
  // CANCEL that accompanies it must not disagree about which revision they are.
  const sequence = await bumpSequence(appointment.id);
  const bumped = { ...appointment, icalSequence: sequence };

  if (verdict.cancelled) {
    return sendAppointmentInvitations({
      appointment: bumped, attendeeRows: attendeesAfter, allAttendeeRows: attendeesAfter,
      method: "CANCEL", sequence, isUpdate: true, reasons: verdict.reasons,
    });
  }

  // Everyone who is still coming, unless the ONLY change is the guest list —
  // in which case the people already on it have nothing new to learn, and
  // mailing them would be the spam this rule exists to prevent.
  const requestTargets = verdict.attendeesOnly ? added : attendeesAfter;

  const request = requestTargets.length
    ? await sendAppointmentInvitations({
        appointment: bumped, attendeeRows: requestTargets, allAttendeeRows: attendeesAfter,
        method: "REQUEST", sequence, isUpdate: !verdict.reinstated, reasons: verdict.reasons,
      })
    : nothingToSend("Nobody is on this appointment to tell.");

  if (removed.length === 0) return request;

  // Somebody taken off the list should lose the entry, not keep a meeting they
  // are no longer part of. Their rows are already deleted, so the per-attendee
  // write-back inside this call matches nothing — deliberately: the record
  // that they were told is the audit line, not a row we keep for a person who
  // is no longer an attendee.
  const cancel = await sendAppointmentInvitations({
    appointment: bumped, attendeeRows: removed, allAttendeeRows: attendeesAfter,
    method: "CANCEL", sequence, isUpdate: true, reasons: ["you were removed from this meeting"],
  });

  return mergeReports(request, cancel);
}

/** Two sets of sends, reported as one truthful whole. */
function mergeReports(a: InvitationReport, b: InvitationReport): InvitationReport {
  const results = [...a.results, ...b.results];
  const accepted = a.accepted + b.accepted;
  const attempted = a.attempted + b.attempted;
  if (attempted === 0) return a;
  // The worse of the two headlines wins: a report that leads with the good
  // half of a mixed outcome is a report that hides the half needing action.
  const worse = a.attempted === 0 ? b : b.attempted === 0 ? a
    : (a.accepted === a.attempted ? b : a);
  return {
    invitationsSent: accepted === attempted,
    attempted, accepted,
    status: worse.status,
    note: a.attempted && b.attempted ? `${a.note} ${b.note}` : worse.note,
    results,
  };
}

router.delete("/crm/appointments/:id", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [existing] = await db.select().from(crmAppointments)
    .where(eq(crmAppointments.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found." }); return; }

  // Cancel rather than delete: a meeting that happened (or was called off)
  // is part of the client's history.
  const [appointment] = await db.update(crmAppointments).set({
    status: "cancelled", cancelledAt: new Date(),
    cancelledByStaffId: actor(req).id,
    cancelReason: typeof (req.body as Record<string, unknown> | undefined)?.["cancelReason"] === "string"
      ? String((req.body as Record<string, unknown>)["cancelReason"]) : existing.cancelReason,
    updatedAt: new Date(),
  }).where(eq(crmAppointments.id, id)).returning();
  await cancelJob(appointmentReminderKey(id));
  await auditAction(req, "appointment.cancelled", `appointment:${id}`);

  // Cancelling something that was ALREADY cancelled is not a second event, so
  // it does not send a second CANCEL. `materialChange` decides that, rather
  // than this route guessing.
  const attendees = await attendeeRowsFor(id);
  const invitations = await announceUpdate({
    appointment, before: snapshot(existing), added: [], removed: [], attendeesAfter: attendees,
  });

  res.json({
    appointment,
    invitationsSent: invitations.invitationsSent,
    invitationNote: invitations.note,
    invitations,
  });
});

/**
 * Sends the CURRENT revision again, to everybody on the appointment.
 *
 * This exists because "not configured" is the normal answer on a server with
 * no mail key: every appointment booked before mail was set up has attendees
 * who were never told, and without this they never would be. It is a re-send,
 * not an edit — the SEQUENCE does not move, because nothing about the meeting
 * changed.
 *
 * Permission-gated exactly like every other write on this router.
 */
router.post("/crm/appointments/:id/invitations", requireCrmAuth("tasks.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [appointment] = await db.select().from(crmAppointments)
    .where(eq(crmAppointments.id, id)).limit(1);
  if (!appointment) { res.status(404).json({ error: "Not found." }); return; }

  const attendeeRows = await attendeeRowsFor(id);
  if (attendeeRows.length === 0) {
    res.status(400).json({ error: "This appointment has no attendees to invite." });
    return;
  }

  const method = appointment.status === "cancelled" ? "CANCEL" as const : "REQUEST" as const;
  const invitations = await sendAppointmentInvitations({
    appointment, attendeeRows, method,
    sequence: appointment.icalSequence,
    isUpdate: appointment.icalSequence > 0,
    reasons: [],
    // A deliberate second copy must NOT be collapsed into the first by the
    // provider's idempotency window — that is the whole point of asking for it.
    attemptTag: `resend-${Date.now()}`,
  });

  await auditAction(
    req, "appointment.invitations_resent",
    `appointment:${id} ${invitations.attempted} message(s) · ${invitations.status}`,
  );

  res.json({
    appointment,
    invitationsSent: invitations.invitationsSent,
    invitationNote: invitations.note,
    invitations,
  });
});

/**
 * An .ics download of one appointment.
 *
 * This is an EXPORT, not synchronisation: importing it copies the event into
 * another calendar once, and later edits here will not follow it. Two-way sync
 * needs a provider integration that does not exist yet.
 *
 * It is built by the SAME generator as an invitation, and differs in exactly
 * one way: it carries no METHOD. A calendar message with METHOD asks a client
 * to add, replace or drop an event on the organiser's authority; a download is
 * a file somebody chose to import. Sharing the generator is what keeps
 * escaping, folding, all-day handling and UTC instants identical in both — a
 * second copy of this code is a second set of bugs.
 */
router.get("/crm/appointments/:id/ics", requireCrmAuth(), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [a] = await db.select().from(crmAppointments).where(eq(crmAppointments.id, id)).limit(1);
  if (!a) { res.status(404).json({ error: "Not found." }); return; }

  const attendeeRows = await attendeeRowsFor(id);
  const staffIds = attendeeRows.map((r) => r.staffId).filter((v): v is number => v != null);
  const people = staffIds.length
    ? await db.select({ id: crmStaff.id, displayName: crmStaff.displayName, email: crmStaff.email })
        .from(crmStaff).where(inArray(crmStaff.id, staffIds))
    : [];
  const byStaffId = new Map(people.map((p) => [p.id, p]));

  const organizerName = a.organizerStaffId != null
    ? byStaffId.get(a.organizerStaffId)?.displayName ?? a.createdByLabel
    : a.createdByLabel;

  const ics = buildAppointmentIcs({
    appointment: a,
    sequence: a.icalSequence,
    organizer: { email: organizerAddress(), name: organizerName },
    attendees: attendeeRows.flatMap((r) => {
      const email = r.staffId != null ? byStaffId.get(r.staffId)?.email : r.externalEmail;
      if (!email) return [];
      return [{
        email,
        name: r.staffId != null ? byStaffId.get(r.staffId)?.displayName ?? null : r.externalName,
        isOrganizer: r.staffId != null && r.staffId === a.organizerStaffId,
      }];
    }),
  });

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="appointment-${a.id}.ics"`);
  res.send(ics);
});

export default router;
