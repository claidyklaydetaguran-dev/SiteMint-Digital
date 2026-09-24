// V7: what the post-call email says.
//
// Pure. No database, no clock, no environment, no provider — every fact arrives
// as an argument, which is what makes "we never invent anything" checkable
// rather than aspirational.
//
// Rules this module enforces by construction:
//
//   - Every line is either a persisted fact or a fixed label. There is no
//     generated prose, no model-written summary, and no inference: if we do not
//     hold a fact, the email says so in plain words instead of guessing.
//   - Outcome is reported from what actually happened — whether a message was
//     saved, and how the provider says the call ended — never as "handled".
//   - Follow-up is stated as an action the business still owes, or explicitly as
//     "none recorded". A call with no saved message must not read like a
//     completed errand.
//   - A browser test is labelled as one, at the top, so a test call can never be
//     mistaken for a customer.
//   - Recording and transcript restrictions are preserved: this email carries
//     the structured message a caller confirmed, never a transcript or a
//     recording link, regardless of what the provider retained.

/** The persisted call facts. Every field is nullable because the ledger's are. */
export interface PostCallFacts {
  providerCallId: string;
  /**
   * Our own label for how the call reached us; 'browser_test' must be visible.
   * 'synthetic_qa' is an event SiteMint itself generated to exercise this
   * pipeline — never a call anyone made — and is labelled as such.
   */
  source: "browser_test" | "telephone" | "synthetic_qa" | "unknown";
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  /** Caller's number as we are willing to display it, already masked upstream. */
  callerNumberDisplay: string | null;
  /** The provider's own ended-reason code. Reported verbatim, never reworded. */
  endedReason: string | null;
}

export interface PostCallMessageFacts {
  callerName: string;
  topic: string;
  details: string;
  callbackPhone: string | null;
  callbackEmail: string | null;
  urgency: "normal" | "urgent";
  emailAckRequested: boolean;
}

/**
 * An appointment the caller asked for on this call.
 *
 * `status` is the persisted status, not a reading of it: `pending_review`
 * means the caller was told the time was requested and someone still has to
 * accept it. A call that requested a time and reported "nothing outstanding"
 * is the defect this exists to close.
 */
export interface PostCallAppointmentFacts {
  customerName: string;
  appointmentTypeName: string;
  startAt: Date;
  status: string;
  customerEmail: string | null;
  customerPhone: string | null;
}

export interface PostCallComposition {
  subject: string;
  body: string;
}

/** Statuses in which the business still owes the caller a decision. */
const AWAITING_DECISION = new Set(["pending_review", "held", "requested"]);

function formatDuration(durationSec: number | null): string {
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec < 0) return "not recorded";
  const total = Math.round(durationSec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatWhen(when: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(when);
}

const SOURCE_LABEL: Record<PostCallFacts["source"], string> = {
  browser_test: "Browser test call (not a real customer)",
  telephone: "Phone call",
  synthetic_qa: "SiteMint QA test event (no call took place)",
  unknown: "Call",
};

export interface ComposePostCallInput {
  businessName: string;
  facts: PostCallFacts;
  messages: readonly PostCallMessageFacts[];
  /** Appointments requested on this call. Empty when the caller asked for none. */
  appointments?: readonly PostCallAppointmentFacts[];
  /** Authenticated deep link into the dashboard. Sign-in still required. */
  dashboardUrl: string;
  /** Business timezone for rendering times; the caller is never shown UTC. */
  timeZone: string;
}

export function composePostCallEmail(input: ComposePostCallInput): PostCallComposition {
  const { facts, messages } = input;
  const appointments = input.appointments ?? [];
  const isTest = facts.source === "browser_test";
  const isSynthetic = facts.source === "synthetic_qa";
  const primary = messages[0];
  const firstAppointment = appointments[0];
  const urgent = messages.some((m) => m.urgency === "urgent");
  const awaiting = appointments.filter((a) => AWAITING_DECISION.has(a.status));

  // An appointment outranks a message in the subject: it is the only outcome
  // that can expire while the business reads its inbox.
  const headline = firstAppointment
    ? `${awaiting.length > 0 ? "Appointment requested" : "Appointment booked"} by ${firstAppointment.customerName}` +
      ` — ${formatWhen(firstAppointment.startAt, input.timeZone)}`
    : messages.length > 0
      ? `New message from ${primary!.callerName}: ${primary!.topic}`
      : "Call received — no message taken";

  const subject = [
    isSynthetic ? "[QA]" : isTest ? "[Test]" : null,
    urgent ? "[Urgent]" : null,
    headline,
  ]
    .filter(Boolean)
    .join(" ");

  const lines: string[] = [];

  if (isSynthetic) {
    lines.push(
      "THIS IS A SITEMINT QA TEST EVENT. No call took place and no customer is",
      "waiting. It was generated to check that call emails reach you.",
      "",
    );
  } else if (isTest) {
    lines.push(
      "THIS WAS A BROWSER TEST CALL, not a customer. It is shown here so you can",
      "see exactly what a real call will send you.",
      "",
    );
  }

  lines.push(`${input.businessName} — AI receptionist`, "");
  lines.push("CALL");
  lines.push(`  Type:      ${SOURCE_LABEL[facts.source]}`);
  lines.push(`  Started:   ${formatWhen(facts.startedAt, input.timeZone)}`);
  lines.push(`  Duration:  ${formatDuration(facts.durationSec)}`);
  lines.push(`  Caller:    ${facts.callerNumberDisplay ?? "not available"}`);
  // The provider's code, as-is. Rewording it into something friendlier is how a
  // failed call starts reading like a successful one.
  lines.push(`  Ended:     ${facts.endedReason ?? "not reported"}`);
  lines.push("");

  for (const [index, appointment] of appointments.entries()) {
    const pending = AWAITING_DECISION.has(appointment.status);
    lines.push(
      appointments.length > 1 ? `APPOINTMENT ${index + 1} OF ${appointments.length}` : "APPOINTMENT",
    );
    lines.push(`  For:       ${appointment.customerName}`);
    lines.push(`  Service:   ${appointment.appointmentTypeName}`);
    lines.push(`  Time:      ${formatWhen(appointment.startAt, input.timeZone)}`);
    lines.push(`  Call back: ${appointment.customerPhone ?? "no number given"}`);
    lines.push(`  Email:     ${appointment.customerEmail ?? "no email given"}`);
    if (pending) {
      // The caller heard "requested, not confirmed". The business must read the
      // same thing, or it will assume the time is already in its calendar.
      lines.push(`  Status:    REQUESTED — not booked. The caller was told the time was`);
      lines.push(`             requested and that someone would confirm it. It is not in`);
      lines.push(`             any calendar until you accept it in the dashboard.`);
    } else if (appointment.status === "booked") {
      lines.push(`  Status:    Booked and written to your connected calendar.`);
    } else {
      lines.push(`  Status:    ${appointment.status}`);
    }
    lines.push("");
  }

  if (messages.length === 0) {
    lines.push("MESSAGE");
    if (appointments.length > 0) {
      lines.push("  None. The caller asked for a time rather than leaving a message.");
    } else {
      lines.push("  None. The assistant did not save a message on this call, so there");
      lines.push("  are no caller details to act on. If you expected one, open the call");
      lines.push("  in the dashboard to see what happened.");
    }
    lines.push("");
    lines.push("WHAT YOU NEED TO DO");
    if (awaiting.length > 0) {
      lines.push(
        awaiting.length > 1
          ? `  Accept or decline ${awaiting.length} requested times in the dashboard. Until you do,`
          : "  Accept or decline the requested time in the dashboard. Until you do,",
      );
      lines.push("  nothing is booked and the caller is waiting on your decision.");
    } else if (appointments.length > 0) {
      lines.push("  Nothing. The appointment above is already booked.");
    } else {
      lines.push("  Nothing is recorded as outstanding from this call.");
    }
  } else {
    for (const [index, message] of messages.entries()) {
      lines.push(messages.length > 1 ? `MESSAGE ${index + 1} OF ${messages.length}` : "MESSAGE");
      lines.push(`  From:      ${message.callerName}`);
      lines.push(`  About:     ${message.topic}`);
      if (message.urgency === "urgent") lines.push(`  Urgency:   marked urgent by the caller`);
      lines.push(`  Call back: ${message.callbackPhone ?? "no number given"}`);
      lines.push(`  Email:     ${message.callbackEmail ?? "no email given"}`);
      lines.push(`  Details:   ${message.details}`);
      if (message.emailAckRequested) {
        // Stated as a request, not a promise: no copy is emailed to the caller
        // automatically, so the business must not read this as already done.
        lines.push(`  The caller asked for a copy by email. No copy has been sent to them;`);
        lines.push(`  reply to the address above if you want to confirm their message.`);
      }
      lines.push("");
    }
    lines.push("WHAT YOU NEED TO DO");
    if (awaiting.length > 0) {
      lines.push(
        awaiting.length > 1
          ? `  Accept or decline ${awaiting.length} requested times in the dashboard — nothing is`
          : "  Accept or decline the requested time in the dashboard — nothing is",
      );
      lines.push("  booked until you do — and follow up on the message above.");
    } else {
      lines.push(
        messages.length > 1
          ? `  Follow up on ${messages.length} saved messages. Nothing has been promised to`
          : "  Follow up with this caller. Nothing has been promised to",
      );
      lines.push("  the caller on your behalf beyond 'someone will follow up'.");
    }
  }

  lines.push("");
  lines.push("OPEN IN YOUR DASHBOARD");
  lines.push(`  ${input.dashboardUrl}`);
  lines.push("  You will be asked to sign in. This link grants no access on its own.");
  lines.push("");
  lines.push("This email contains the structured message the caller confirmed. It");
  lines.push("carries no call recording and no transcript.");

  return { subject, body: lines.join("\n") };
}
