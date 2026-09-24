// What the CALLER receives after asking for an appointment on a call.
//
// Deliberately a separate module from postCallComposer: that one is written for
// the business and may name the caller's number, their message and the
// dashboard. This one goes to a member of the public, so it carries only what
// that person already told us plus what the business offers, and never a
// dashboard link, another caller's details, or anything about the account.
//
// Pure. Every fact arrives as an argument, which is what makes "we never invent
// anything" checkable rather than aspirational.
//
// Rules this module enforces by construction:
//
//   - A requested time is never described as booked. The caller heard
//     "requested, not confirmed" on the call; this email says the same thing,
//     because an email that upgrades the outcome is how someone arrives for an
//     appointment nobody accepted.
//   - "Confirmed" is only ever produced from a calendar booking that actually
//     succeeded — the caller of this module passes `status: "booked"` solely
//     after the write returned `booked`.
//   - The timezone is named in words as well as rendered into the time, because
//     a caller in another zone cannot otherwise tell which 10:00 is meant.
//   - It says why the person is receiving it, since they gave the address by
//     voice and may not remember agreeing.

/** The persisted appointment facts, as the caller is entitled to see them. */
export interface CallerAckFacts {
  /** The business the caller rang — not SiteMint. */
  businessName: string;
  /** The appointment type's own name, e.g. "Consultation". */
  serviceName: string;
  startAt: Date;
  /** IANA zone the business works in; rendered AND named. */
  timeZone: string;
  /**
   * `pending` — a request nobody has accepted yet.
   * `booked`  — a calendar write that returned success.
   */
  status: "pending" | "booked";
  /** The durable public reference the caller can quote. */
  reference: string;
}

export interface CallerAckComposition {
  subject: string;
  body: string;
}

export function formatWhen(when: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(when);
}

export function composeCallerAckEmail(facts: CallerAckFacts): CallerAckComposition {
  const booked = facts.status === "booked";
  const when = formatWhen(facts.startAt, facts.timeZone);

  const subject = booked
    ? `Appointment confirmed — ${facts.businessName}, ${when}`
    : `Appointment requested — ${facts.businessName}, ${when}`;

  const lines: string[] = [];

  lines.push(facts.businessName, "");
  lines.push(
    booked
      ? "Your appointment is confirmed. Here are the details."
      : "You asked for an appointment on your call. Here is what you asked for.",
  );
  lines.push("");

  lines.push("APPOINTMENT");
  lines.push(`  Service:   ${facts.serviceName}`);
  lines.push(`  When:      ${when}`);
  lines.push(`  Timezone:  ${facts.timeZone}`);
  lines.push(
    booked
      ? "  Status:    CONFIRMED — booked"
      : "  Status:    REQUESTED — not booked",
  );
  lines.push("");

  lines.push("WHAT HAPPENS NEXT");
  if (booked) {
    lines.push(`  This time is booked and is in ${facts.businessName}'s calendar.`);
    lines.push(`  To change or cancel it, contact ${facts.businessName} and quote the`);
    lines.push("  reference below. If their calendar also sends you its own invitation,");
    lines.push("  that is a separate email from this one.");
  } else {
    // The single most important paragraph in this file.
    lines.push(`  Nothing is booked yet. ${facts.businessName} still has to accept this`);
    lines.push("  time, and it is not being held in anyone's calendar until they do.");
    lines.push("  You will not receive a calendar invitation unless they confirm it.");
    lines.push(`  If you do not hear back, contact ${facts.businessName} directly.`);
  }
  lines.push("");

  lines.push(`Reference: ${facts.reference}`);
  lines.push("");
  lines.push("You are receiving this because you gave this address on the call and");
  lines.push(`asked for a copy. SiteMint sent it for ${facts.businessName}.`);

  return { subject, body: lines.join("\n") };
}

/**
 * What the caller receives when the BUSINESS changes an appointment from the
 * dashboard: declined (a request it will not accept), cancelled (a booking it
 * called off) or rescheduled (a booking moved to a new, confirmed time).
 * Same rules as above: only what the caller already knows plus the change,
 * the timezone named, and never a dashboard link.
 */
export interface CallerChangeFacts {
  businessName: string;
  serviceName: string;
  startAt: Date;
  timeZone: string;
  reference: string;
  change: "declined" | "cancelled" | "rescheduled";
  /** Rescheduled only: the new, confirmed time and its reference. */
  newStartAt?: Date;
  newReference?: string;
}

export function composeCallerChangeEmail(facts: CallerChangeFacts): CallerAckComposition {
  const when = formatWhen(facts.startAt, facts.timeZone);
  const lines: string[] = [facts.businessName, ""];
  let subject: string;
  if (facts.change === "rescheduled" && facts.newStartAt) {
    const next = formatWhen(facts.newStartAt, facts.timeZone);
    subject = `Appointment moved — ${facts.businessName}, now ${next}`;
    lines.push(`${facts.businessName} moved your appointment. The new time is confirmed and in their calendar.`, "");
    lines.push("APPOINTMENT");
    lines.push(`  Service:   ${facts.serviceName}`);
    lines.push(`  New time:  ${next}`);
    lines.push(`  Was:       ${when}`);
    lines.push(`  Timezone:  ${facts.timeZone}`);
    lines.push("  Status:    CONFIRMED — booked", "");
    lines.push(`Reference: ${facts.newReference ?? facts.reference}`);
  } else if (facts.change === "declined") {
    subject = `Appointment request not confirmed — ${facts.businessName}, ${when}`;
    lines.push(`${facts.businessName} could not confirm the time you asked for. Nothing is booked.`, "");
    lines.push("APPOINTMENT");
    lines.push(`  Service:   ${facts.serviceName}`);
    lines.push(`  Asked for: ${when}`);
    lines.push(`  Timezone:  ${facts.timeZone}`);
    lines.push("  Status:    NOT BOOKED", "");
    lines.push(`To find another time, contact ${facts.businessName} directly.`, "");
    lines.push(`Reference: ${facts.reference}`);
  } else {
    subject = `Appointment cancelled — ${facts.businessName}, ${when}`;
    lines.push(`${facts.businessName} cancelled your appointment. It is no longer in their calendar.`, "");
    lines.push("APPOINTMENT");
    lines.push(`  Service:   ${facts.serviceName}`);
    lines.push(`  Was:       ${when}`);
    lines.push(`  Timezone:  ${facts.timeZone}`);
    lines.push("  Status:    CANCELLED", "");
    lines.push(`To book again, contact ${facts.businessName} directly.`, "");
    lines.push(`Reference: ${facts.reference}`);
  }
  lines.push("");
  lines.push("You are receiving this because you asked to be emailed about this");
  lines.push(`appointment. SiteMint sent it for ${facts.businessName}.`);
  return { subject, body: lines.join("\n") };
}

/** The matching one-line text, for a caller who agreed to texts. Ends with the STOP line. */
export function composeCallerChangeText(facts: CallerChangeFacts | (Omit<CallerChangeFacts, "change"> & { change: "booked" })): string {
  const when = formatWhen(facts.startAt, facts.timeZone);
  const who = facts.businessName.trim().slice(0, 60);
  let line: string;
  switch (facts.change) {
    case "booked":
      line = `Your ${facts.serviceName} on ${when} is confirmed.`;
      break;
    case "declined":
      line = `We couldn't confirm your ${facts.serviceName} request for ${when}. Nothing is booked — please contact us for another time.`;
      break;
    case "cancelled":
      line = `Your ${facts.serviceName} on ${when} has been cancelled.`;
      break;
    case "rescheduled":
      line = `Your ${facts.serviceName} has moved to ${facts.newStartAt ? formatWhen(facts.newStartAt, facts.timeZone) : "a new time"} and is confirmed.`;
      break;
  }
  const ref = facts.change === "rescheduled" && "newReference" in facts && facts.newReference ? facts.newReference : facts.reference;
  return `${who}: ${line} Ref ${ref.slice(0, 8)}. Reply STOP to opt out.`;
}
