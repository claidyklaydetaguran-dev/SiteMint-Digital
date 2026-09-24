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

function formatWhen(when: Date, timeZone: string): string {
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
