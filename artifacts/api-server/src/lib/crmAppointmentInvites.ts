// ── M4: attendee invitations for the internal calendar ──────────────────────
//
// Until now an appointment recorded WHO was expected and told nobody. The
// `.ics` button was a one-time export, and `POST /crm/appointments` answered
// `invitationsSent: false` because that was the truth.
//
// This module is what makes an invitation possible, and it keeps three
// promises that are easy to break:
//
//  1. ONE generator. The `.ics` download and the emailed invitation are built
//     by the same `buildAppointmentIcs`, so a fix to escaping, folding or
//     timezone handling cannot land in one and miss the other. The download
//     carries no METHOD (a download is not a scheduling message); an
//     invitation carries METHOD:REQUEST and a cancellation METHOD:CANCEL.
//
//  2. ONE identity. `appointmentUid(id)` is derived from the row's primary
//     key, so it is stable for the life of the appointment by construction
//     rather than by remembering to persist it. An update reuses it with a
//     higher SEQUENCE, which is exactly what makes an attendee's calendar
//     REPLACE the event instead of adding a second one.
//
//  3. ONE vocabulary for "did it go". `staffMail.ts` already classifies every
//     send into `not_configured | rejected | failed | uncertain`, and this
//     module reports those words unchanged. It does not invent a parallel
//     scheme, and it never reports success it did not observe.
//
// What is deliberately NOT here: RSVP handling. Nothing ingests a reply, so
// `responseStatus` still means "what staff recorded", not "what the attendee
// answered". Saying otherwise would be the same lie this module exists to end.

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, crmAppointments, crmAppointmentAttendees, crmStaff,
  type CrmAppointment, type CrmAppointmentAttendee,
} from "@workspace/db";
import { trySendStaffMail, type MailFailure } from "./staffMail.js";

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * The iCalendar UID domain. A UID must be globally unique and stable; pairing
 * the row's primary key with our own domain gives both without a column.
 */
export const APPOINTMENT_UID_DOMAIN = "sitemintdigital.com";

/** The UID every message about this appointment carries, forever. */
export function appointmentUid(appointmentId: number): string {
  return `sitemint-crm-appointment-${appointmentId}@${APPOINTMENT_UID_DOMAIN}`;
}

/**
 * The address invitations come from and replies would go to.
 *
 * Deliberately the same envelope `staffMail.ts` sends everything else from: an
 * ORGANIZER address the sending domain is not authorised for is the fastest
 * way to have every invitation land in spam.
 */
export function organizerAddress(env: NodeJS.ProcessEnv = process.env): string {
  const from = env["RESEND_FROM_EMAIL"]
    ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>";
  const angled = from.match(/<([^>]+)>/);
  return (angled?.[1] ?? from).trim();
}

// ── Building the payload ────────────────────────────────────────────────────

export type IcsMethod = "REQUEST" | "CANCEL";

export interface IcsAttendee {
  email: string;
  name?: string | null;
  /** The organiser attends their own meeting as CHAIR and has already accepted. */
  isOrganizer?: boolean;
}

export interface IcsInput {
  appointment: Pick<CrmAppointment,
    | "id" | "title" | "description" | "startAt" | "endAt" | "allDay"
    | "timezone" | "location" | "meetingUrl" | "status">;
  /** Omitted for a plain download — a download is not a scheduling message. */
  method?: IcsMethod;
  sequence: number;
  organizer: { email: string; name?: string | null };
  attendees?: IcsAttendee[];
  /** Injectable so a test can assert exact bytes. */
  now?: Date;
}

/** `20260915T091500Z` — an absolute instant, which is what an attendee needs. */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The calendar date `instant` falls on in `zone`, as `20260915`. */
function localDateStamp(instant: Date, zone: string): string {
  let iso: string;
  try {
    iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(instant);
  } catch {
    iso = instant.toISOString().slice(0, 10); // unknown zone → UTC, never throw
  }
  return iso.replace(/-/g, "");
}

/** The day after `instant`'s local date — an all-day DTEND is exclusive. */
function localDateStampExclusive(instant: Date, zone: string): string {
  return localDateStamp(new Date(instant.getTime() + 24 * 3600_000), zone);
}

/** RFC 5545 §3.3.11 text escaping. Backslash first, or it escapes its own output. */
function escText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 content-line folding: no line over 75 OCTETS, continuations
 * begin with a single space. Measured in UTF-8 bytes, not characters, and a
 * multi-byte character is never split across the fold — a client that receives
 * half a character rejects the whole calendar.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut inside a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // a continuation line spends one octet on its leading space
  }
  return out.join("\r\n ");
}

/**
 * One VCALENDAR for one appointment.
 *
 * Both the download and the invitation come through here. `method` is the only
 * thing that makes it a scheduling message: with it a mail client offers to
 * add, update or drop the event; without it the file is an ordinary import.
 */
export function buildAppointmentIcs(input: IcsInput): string {
  const { appointment: a, method, sequence, organizer } = input;
  const zone = a.timezone || "UTC";
  const attendees = input.attendees ?? [];
  const cancelled = method === "CANCEL" || a.status === "cancelled";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SiteMint Digital//CRM//EN",
    "CALSCALE:GREGORIAN",
    ...(method ? [`METHOD:${method}`] : []),
    "BEGIN:VEVENT",
    `UID:${appointmentUid(a.id)}`,
    `DTSTAMP:${utcStamp(input.now ?? new Date())}`,
  ];

  if (a.allDay) {
    // A whole-day event is a DATE, not an instant, and its DTEND is the day
    // AFTER the last day it covers.
    lines.push(`DTSTART;VALUE=DATE:${localDateStamp(a.startAt, zone)}`);
    lines.push(`DTEND;VALUE=DATE:${localDateStampExclusive(a.endAt, zone)}`);
  } else {
    // UTC instants. An attendee in another zone gets the right moment because
    // the moment is absolute — no VTIMEZONE block to get wrong, and no
    // dependence on the booker's zone being known to the reader's client.
    lines.push(`DTSTART:${utcStamp(a.startAt)}`);
    lines.push(`DTEND:${utcStamp(a.endAt)}`);
  }

  lines.push(`SEQUENCE:${Math.max(0, Math.trunc(sequence))}`);
  lines.push(`SUMMARY:${escText(a.title)}`);

  const descriptionParts: string[] = [];
  if (a.description) descriptionParts.push(a.description);
  if (a.meetingUrl) descriptionParts.push(`Join: ${a.meetingUrl}`);
  if (descriptionParts.length) lines.push(`DESCRIPTION:${escText(descriptionParts.join("\n\n"))}`);

  // LOCATION is what a phone shows on the lock screen, so a join link belongs
  // there too when there is no physical place.
  const location = a.location ?? a.meetingUrl;
  if (location) lines.push(`LOCATION:${escText(location)}`);
  if (a.meetingUrl) lines.push(`URL:${a.meetingUrl}`);

  const organizerCn = organizer.name ? `;CN=${escText(organizer.name)}` : "";
  lines.push(`ORGANIZER${organizerCn}:mailto:${organizer.email}`);

  for (const at of attendees) {
    const cn = at.name ? `;CN=${escText(at.name)}` : "";
    lines.push(
      at.isOrganizer
        ? `ATTENDEE${cn};ROLE=CHAIR;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${at.email}`
        : `ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${at.email}`,
    );
  }

  lines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldIcsLine).join("\r\n");
}

// ── What counts as a material change ────────────────────────────────────────
//
// The rule, stated once and tested:
//
//   MATERIAL — the attendee's own calendar entry would be WRONG if they were
//   not told. Time, duration, all-day-ness, where it happens, how to join it,
//   what it is called, who is running it, and whether it is happening at all.
//
//   NOT MATERIAL — internal bookkeeping the attendee never sees. Notes, the
//   reminder lead time, the timezone LABEL the booking was made in (the
//   instant is unchanged, and the payload carries the instant), which lead,
//   deal or project it is filed against, and marking a meeting that already
//   happened as held.
//
// The distinction exists for one reason: an update email is an interruption.
// Sending one because somebody fixed a typo in the notes trains people to
// ignore the ones that move a meeting.

export const MATERIAL_FIELDS = [
  "startAt", "endAt", "allDay", "title", "location", "meetingUrl", "organizerStaffId",
] as const;

export type MaterialField = (typeof MATERIAL_FIELDS)[number];

export type AppointmentSnapshot = Pick<CrmAppointment,
  "startAt" | "endAt" | "allDay" | "title" | "location" | "meetingUrl" | "organizerStaffId" | "status">;

export interface MaterialVerdict {
  /** Must attendees be told about this edit at all? */
  material: boolean;
  /** Human-readable reasons, for the response and the audit line. */
  reasons: string[];
  /** Cancelled, or reinstated from cancelled — these change the METHOD. */
  cancelled: boolean;
  reinstated: boolean;
  /** True when the ONLY material change is who is coming. */
  attendeesOnly: boolean;
}

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * Compares two revisions of an appointment and decides whether attendees hear
 * about it. Pure: no database, no clock, no mail — so the rule can be tested
 * exhaustively without either.
 */
export function materialChange(
  before: AppointmentSnapshot,
  after: AppointmentSnapshot,
  attendees: { added: string[]; removed: string[] } = { added: [], removed: [] },
): MaterialVerdict {
  const reasons: string[] = [];

  if (!sameInstant(before.startAt, after.startAt)) reasons.push("the start time moved");
  if (!sameInstant(before.endAt, after.endAt)) reasons.push("the end time moved");
  if (before.allDay !== after.allDay) reasons.push("it changed between all-day and timed");
  if (before.title !== after.title) reasons.push("the title changed");
  if ((before.location ?? "") !== (after.location ?? "")) reasons.push("the location changed");
  if ((before.meetingUrl ?? "") !== (after.meetingUrl ?? "")) reasons.push("the meeting link changed");
  if (before.organizerStaffId !== after.organizerStaffId) reasons.push("the organiser changed");

  const fieldReasons = reasons.length;
  if (attendees.added.length) reasons.push(`${attendees.added.length} attendee(s) were added`);
  if (attendees.removed.length) reasons.push(`${attendees.removed.length} attendee(s) were removed`);

  const cancelled = before.status !== "cancelled" && after.status === "cancelled";
  const reinstated = before.status === "cancelled" && after.status === "scheduled";
  if (cancelled) reasons.push("it was cancelled");
  if (reinstated) reasons.push("it was reinstated");

  return {
    material: reasons.length > 0,
    reasons,
    cancelled,
    reinstated,
    // Only the people joining or leaving need telling when nothing else moved.
    attendeesOnly: fieldReasons === 0 && !cancelled && !reinstated
      && (attendees.added.length > 0 || attendees.removed.length > 0),
  };
}

// ── Sending, and reporting what actually happened ───────────────────────────

/**
 * What the mail seam said, in the seam's own words plus the one word it has no
 * reason to carry: `sent`.
 */
export type InvitationOutcome = "sent" | MailFailure;

export interface AttendeeInvitationResult {
  attendeeId: number;
  /** Masked — an operator needs to recognise the row, not read the address. */
  email: string;
  staffId: number | null;
  method: IcsMethod;
  sequence: number;
  outcome: InvitationOutcome;
  reason: string | null;
  providerId: string | null;
}

export interface InvitationReport {
  /** True ONLY when every message was accepted by the provider. */
  invitationsSent: boolean;
  /** How many were attempted, and how many the provider took. */
  attempted: number;
  accepted: number;
  /** The single word the UI leads with: `sent`, or the dominant failure. */
  status: InvitationOutcome | "none_to_send";
  /** Plain English, always safe to show a person. */
  note: string;
  results: AttendeeInvitationResult[];
}

const NOTHING_TO_SEND: InvitationReport = {
  invitationsSent: false,
  attempted: 0,
  accepted: 0,
  status: "none_to_send",
  note: "Nothing needed sending — this change does not affect anybody's calendar.",
  results: [],
};

export function nothingToSend(note?: string): InvitationReport {
  return note ? { ...NOTHING_TO_SEND, note } : NOTHING_TO_SEND;
}

/** `cl•••@company.com` — recognisable without reproducing the address. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const user = email.slice(0, at);
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${"•".repeat(3)}${email.slice(at)}`;
}

/**
 * How badly it went, when it did not all go well.
 *
 * Ordered by how much a person has to do about it: an unknown outcome needs a
 * human, a refusal needs a fix, a transient failure needs patience, and "no
 * mail on this server" needs an API key.
 */
const SEVERITY: InvitationOutcome[] = ["uncertain", "rejected", "failed", "not_configured", "sent"];

function dominant(results: AttendeeInvitationResult[]): InvitationOutcome {
  for (const s of SEVERITY) if (results.some((r) => r.outcome === s)) return s;
  return "sent";
}

const NOTE_FOR: Record<InvitationOutcome, (n: number, reason: string | null) => string> = {
  sent: (n) => `${n} invitation${n === 1 ? "" : "s"} accepted by the mail provider.`,
  not_configured: (n, reason) =>
    `No invitation was emailed. ${reason ?? "Mail is not configured on this server."} `
    + `${n} attendee${n === 1 ? " is" : "s are"} recorded on the appointment, and nothing was sent.`,
  rejected: (n) =>
    `The mail provider refused ${n} message${n === 1 ? "" : "s"}. Nothing was delivered; `
    + "fix the address or the sending domain and send again.",
  failed: (n) =>
    `${n} message${n === 1 ? "" : "s"} could not be handed to the mail provider. Nothing was `
    + "delivered, so sending again cannot duplicate.",
  uncertain: (n) =>
    `${n} message${n === 1 ? "" : "s"} may or may not have been delivered — the provider never `
    + "answered. Check with the attendee before sending again.",
};

/** A staff attendee's address, or an external attendee's own. */
async function addressesFor(
  rows: CrmAppointmentAttendee[],
): Promise<Map<number, { email: string; name: string | null; staffId: number | null }>> {
  const staffIds = [...new Set(rows.map((r) => r.staffId).filter((v): v is number => v != null))];
  const staff = staffIds.length
    ? await db.select({ id: crmStaff.id, email: crmStaff.email, displayName: crmStaff.displayName, status: crmStaff.status })
        .from(crmStaff).where(inArray(crmStaff.id, staffIds))
    : [];
  const byId = new Map(staff.map((s) => [s.id, s]));

  const out = new Map<number, { email: string; name: string | null; staffId: number | null }>();
  for (const r of rows) {
    if (r.staffId != null) {
      const s = byId.get(r.staffId);
      // A disabled account is not a mailbox we should be writing to.
      if (!s || s.status === "disabled") continue;
      out.set(r.id, { email: s.email, name: s.displayName, staffId: r.staffId });
    } else if (r.externalEmail) {
      out.set(r.id, { email: r.externalEmail, name: r.externalName, staffId: null });
    }
  }
  return out;
}

function humanWhen(a: Pick<CrmAppointment, "startAt" | "endAt" | "allDay" | "timezone">): string {
  const zone = a.timezone || "UTC";
  try {
    if (a.allDay) {
      return `${new Intl.DateTimeFormat("en-US", {
        timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric",
      }).format(a.startAt)} (all day, ${zone})`;
    }
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric",
    }).format(a.startAt);
    const from = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour: "numeric", minute: "2-digit",
    }).format(a.startAt);
    const to = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour: "numeric", minute: "2-digit",
    }).format(a.endAt);
    return `${day}, ${from} – ${to} (${zone})`;
  } catch {
    return `${a.startAt.toISOString()} – ${a.endAt.toISOString()} (UTC)`;
  }
}

/**
 * The message body.
 *
 * The times are spelled out in the appointment's own zone AND the instant is
 * carried by the attachment, so a recipient elsewhere is never asked to do the
 * arithmetic themselves.
 */
export function invitationMessage(args: {
  appointment: Pick<CrmAppointment,
    "title" | "startAt" | "endAt" | "allDay" | "timezone" | "location" | "meetingUrl" | "description" | "cancelReason">;
  method: IcsMethod;
  organizerName: string;
  isUpdate: boolean;
  reasons: string[];
}): { subject: string; text: string } {
  const a = args.appointment;
  const when = humanWhen(a);
  const where = a.location ? `\nWhere: ${a.location}` : "";
  const join = a.meetingUrl ? `\nJoin: ${a.meetingUrl}` : "";
  const notes = a.description ? `\n\n${a.description}` : "";

  if (args.method === "CANCEL") {
    return {
      subject: `Cancelled: ${a.title}`,
      text: `${args.organizerName} has cancelled this meeting.\n\n`
        + `${a.title}\nWhen: ${when}${where}\n`
        + (a.cancelReason ? `\nReason: ${a.cancelReason}\n` : "")
        + `\nThe attached calendar file removes it from your calendar. `
        + `Nothing is expected of you.`,
    };
  }

  const changed = args.reasons.length ? `\n\nWhat changed: ${args.reasons.join("; ")}.` : "";
  return {
    subject: args.isUpdate ? `Updated: ${a.title}` : `Invitation: ${a.title}`,
    text: `${args.organizerName} ${args.isUpdate ? "has updated" : "has invited you to"} this meeting.\n\n`
      + `${a.title}\nWhen: ${when}${where}${join}${notes}${changed}\n\n`
      + `The attached calendar file adds it to your calendar`
      + `${args.isUpdate ? ", replacing the earlier version" : ""}.`,
  };
}

/**
 * Sends one revision of one appointment to a chosen set of attendee rows, and
 * writes down exactly what the mail seam said about each.
 *
 * Nothing here throws: a mail problem must never fail the booking that caused
 * it. Every attendee row is updated whether the send worked or not, so the
 * calendar can always show the truth rather than the last success.
 *
 * Sends are made in the request that caused them rather than queued. That is a
 * deliberate trade: an internal meeting has a handful of attendees, and the
 * caller gets a truthful per-person answer instead of a promise. When mail is
 * unconfigured — as it is on this server — `trySendStaffMail` returns before
 * constructing a request, so this costs nothing at all.
 */
export async function sendAppointmentInvitations(args: {
  appointment: CrmAppointment;
  attendeeRows: CrmAppointmentAttendee[];
  method: IcsMethod;
  sequence: number;
  isUpdate: boolean;
  reasons: string[];
  /** Everyone on the event, for the ATTENDEE list inside the payload. */
  allAttendeeRows?: CrmAppointmentAttendee[];
  /** Distinguishes a deliberate re-send from the original. */
  attemptTag?: string;
}): Promise<InvitationReport> {
  const { appointment, method, sequence } = args;
  if (args.attendeeRows.length === 0) return nothingToSend();

  const roster = args.allAttendeeRows ?? args.attendeeRows;
  const rosterAddresses = await addressesFor(roster);
  const targetAddresses = await addressesFor(args.attendeeRows);
  if (targetAddresses.size === 0) {
    return nothingToSend("No attendee on this appointment has a reachable email address.");
  }

  const organizerRow = appointment.organizerStaffId != null
    ? roster.find((r) => r.staffId === appointment.organizerStaffId)
    : undefined;
  const organizerName = (organizerRow && rosterAddresses.get(organizerRow.id)?.name)
    ?? appointment.createdByLabel;
  const organizer = { email: organizerAddress(), name: organizerName };

  const icsAttendees: IcsAttendee[] = [...rosterAddresses.entries()].map(([rowId, who]) => ({
    email: who.email,
    name: who.name,
    isOrganizer: appointment.organizerStaffId != null && who.staffId === appointment.organizerStaffId
      && rowId === organizerRow?.id,
  }));

  const ics = buildAppointmentIcs({
    appointment, method, sequence, organizer, attendees: icsAttendees,
  });
  const message = invitationMessage({
    appointment, method, organizerName, isUpdate: args.isUpdate, reasons: args.reasons,
  });

  const results: AttendeeInvitationResult[] = [];
  const now = new Date();

  for (const [attendeeId, who] of targetAddresses) {
    // Per appointment, per revision, per method, per recipient. Two attendees
    // get different keys (their messages differ), and a retry of the SAME
    // revision collapses into the original rather than arriving twice.
    const idempotencyKey = [
      "appointment-invite", appointment.id, method, sequence, who.email,
      ...(args.attemptTag ? [args.attemptTag] : []),
    ].join(":");

    const outcome = await trySendStaffMail({
      to: who.email,
      subject: message.subject,
      text: message.text,
      idempotencyKey,
      attachments: [{
        filename: "invite.ics",
        content: Buffer.from(ics, "utf8").toString("base64"),
        contentType: `text/calendar; charset=utf-8; method=${method}`,
      }],
    });

    const result: AttendeeInvitationResult = outcome.sent
      ? {
          attendeeId, email: maskEmail(who.email), staffId: who.staffId,
          method, sequence, outcome: "sent", reason: null, providerId: outcome.providerId,
        }
      : {
          attendeeId, email: maskEmail(who.email), staffId: who.staffId,
          method, sequence, outcome: outcome.failure, reason: outcome.reason, providerId: null,
        };
    results.push(result);

    await db.update(crmAppointmentAttendees).set({
      invitationOutcome: result.outcome,
      invitationReason: result.reason?.slice(0, 500) ?? null,
      invitationMethod: method,
      invitationSequence: sequence,
      invitationAt: now,
      invitationProviderId: result.providerId,
    }).where(eq(crmAppointmentAttendees.id, attendeeId));
  }

  const accepted = results.filter((r) => r.outcome === "sent").length;
  const status = dominant(results);
  const count = results.filter((r) => r.outcome === status).length;
  const reason = results.find((r) => r.outcome === status)?.reason ?? null;

  return {
    invitationsSent: accepted === results.length && results.length > 0,
    attempted: results.length,
    accepted,
    status,
    note: NOTE_FOR[status](count, reason),
    results,
  };
}

/** Every attendee row on an appointment, oldest first. */
export async function attendeeRowsFor(appointmentId: number): Promise<CrmAppointmentAttendee[]> {
  return db.select().from(crmAppointmentAttendees)
    .where(eq(crmAppointmentAttendees.appointmentId, appointmentId))
    .orderBy(crmAppointmentAttendees.id);
}

/**
 * Bumps and returns the appointment's SEQUENCE.
 *
 * The increment happens INSIDE the UPDATE rather than as read-then-write, so
 * two edits landing at once get two different numbers instead of both reading
 * the same one and issuing two messages a calendar cannot order.
 */
export async function bumpSequence(appointmentId: number): Promise<number> {
  const [row] = await db.update(crmAppointments)
    .set({
      icalSequence: sql`${crmAppointments.icalSequence} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(crmAppointments.id, appointmentId))
    .returning({ sequence: crmAppointments.icalSequence });
  return row?.sequence ?? 0;
}

/** Attendee rows for a subset of ids. */
export async function attendeeRowsByIds(
  appointmentId: number, ids: number[],
): Promise<CrmAppointmentAttendee[]> {
  if (ids.length === 0) return [];
  return db.select().from(crmAppointmentAttendees).where(and(
    eq(crmAppointmentAttendees.appointmentId, appointmentId),
    inArray(crmAppointmentAttendees.id, ids),
  ));
}
