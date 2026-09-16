/**
 * V5 customer-shell foundation — the Setup hub's facts, as pure functions
 * (S-3: persistent guided onboarding, one next action, no
 * automatic activation).
 *
 * Status for each step comes from two places, and they are combined
 * deliberately rather than either one winning outright:
 *
 *  1. **The saved onboarding state** (`GET/PUT /api/receptionist/onboarding`,
 *     `lib/onboardingApi.ts`) — the backend's own record of `pending` /
 *     `done` / `blocked` per step. This is authoritative once it exists.
 *  2. **Real-data inference**, for the steps real data can actually settle:
 *     business (firm name + industry present), email confirmation (the server
 *     says mail would be delivered), availability (a config row exists),
 *     calendar (connected) and phone number (a number is assigned). A step
 *     already saved `blocked` stays `blocked` — inference
 *     only ever upgrades `pending` toward `done`, never invents a block and
 *     never overrides one the backend recorded.
 *
 * `deriveStepStatuses` returns the combined status per step so the caller
 * (Setup.tsx) can `PUT` any step it inferred as newly done back to the
 * server — idempotently, per the brief.
 *
 * No imports, so this stays portable into the plain `tsx` test runner with
 * no path aliases.
 */

export const SETUP_STEP_KEYS = [
  "business",
  // Added because setup could be completed in full and the business would still
  // never hear anything: every message SiteMint sends goes only to a VERIFIED
  // address, and nothing on this checklist mentioned it.
  "email_verified",
  "assistant",
  "prompt",
  "voice",
  "availability",
  "appointment_types",
  "calendar",
  "test_call",
  "phone_number",
  "review",
] as const;

export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];

/**
 * `unknown` is "not checked": the signal this step depends on could not be
 * read, so SiteMint does not know. It is deliberately not the same as
 * `pending` (we know it is outstanding) and must never be shown as `done`.
 */
export type StepStatus = "pending" | "done" | "blocked" | "unknown";
export type DisplayStatus = "done" | "next" | "pending" | "blocked" | "unknown";

export interface SetupStepMeta {
  key: SetupStepKey;
  title: string;
  detail: string;
  /** Base-relative deep link, or null for the in-page review step. */
  href: string | null;
}

/** Order and copy for the steps: the ten from S-3, plus email confirmation. */
export const SETUP_STEPS: SetupStepMeta[] = [
  {
    key: "business",
    title: "Business information",
    detail: "Tell SiteMint about your business so the receptionist can speak accurately about it.",
    href: "/account/settings",
  },
  {
    key: "email_verified",
    title: "Confirm your email address",
    detail: "Nothing is sent to an address nobody has confirmed — no call summaries, no alerts, nothing.",
    href: "/verify-email",
  },
  {
    key: "assistant",
    title: "Assistant goal and role",
    detail: "Define what your receptionist is for and how it should behave.",
    href: "/assistants",
  },
  {
    key: "prompt",
    title: "Prompt and caller handling",
    detail: "Write how the receptionist greets callers and handles requests.",
    href: "/assistants",
  },
  {
    key: "voice",
    title: "Voice",
    detail: "Choose the voice your receptionist speaks with.",
    href: "/assistants",
  },
  {
    key: "availability",
    title: "Business hours and availability",
    detail: "Set when your business can take appointments.",
    href: "/scheduling/availability",
  },
  {
    key: "appointment_types",
    title: "Appointment types",
    detail: "Define the kinds of appointments callers can request.",
    href: "/scheduling/appointment-types",
  },
  {
    key: "calendar",
    title: "Google Calendar",
    detail: "Connect your calendar so bookings sync automatically.",
    href: "/scheduling/calendar",
  },
  {
    key: "test_call",
    // Worded for what actually settles it: a call record existing. The old
    // title named one particular way of producing that record (a browser
    // test), which is not what the tick is read from and not the only way to
    // get one.
    title: "Test call",
    detail: "Place a call to your receptionist and check how it answers. This is done once SiteMint has a record of a real call.",
    href: "/assistants",
  },
  {
    key: "phone_number",
    title: "Phone number assignment",
    detail: "Assign the number your receptionist will answer on.",
    href: "/channels/phone-number",
  },
  {
    key: "review",
    title: "Final review and activation",
    detail: "Review everything before requesting activation.",
    href: null,
  },
];

export const BLOCKED_FALLBACK_REASON = "Complete the previous steps first.";

/**
 * What to say when recording progress on the server fails.
 *
 * The wording matters because of what this page now is: every status below is
 * worked out from live configuration on each visit, not read back from a
 * stored tick. So a failed write costs the saved *record* of progress and
 * nothing else — the checklist a customer is looking at is still correct. The
 * sentence says that rather than implying their setup was lost, and it is
 * shown rather than swallowed, which is the whole point: the previous version
 * fired this write with `void`, every request was rejected with a 400, and the
 * page reported success anyway.
 */
export const PROGRESS_SAVE = {
  failedTitle: "Your progress wasn't recorded",
  failedDetail:
    "Everything shown here is still correct — it is worked out from your live settings each time you open this page. Only SiteMint's saved record of it didn't update.",
  retryLabel: "Try again",
} as const;

/**
 * What SiteMint can actually check, and what "checked" means for each.
 *
 * Every field is `boolean | null`: `true` the capability is genuinely in
 * place, `false` it genuinely is not, `null` SiteMint could not find out. That
 * third case is why this shape exists — a failed or unavailable read is
 * reported as "not checked" rather than being quietly folded into either
 * answer.
 *
 * These are capabilities, not ticks. A step reads done because the
 * configuration behind it is in place *now*, so a calendar whose access is
 * later withdrawn, or a number that is released, stops reading as done on the
 * next visit rather than keeping a tick it can no longer justify.
 */
export interface SetupSignals {
  /** From the business profile: firm name and industry both present. */
  businessComplete: boolean | null;
  /**
   * From the account email-status read, which asks the SAME resolver the
   * sender uses — so this tick means mail would actually be delivered, not
   * that a column somewhere looks right.
   */
  emailVerified: boolean | null;
  /** An assistant exists and its own status is exactly "published". */
  assistantPublished: boolean | null;
  /**
   * The voice provider is running the configuration saved here. Not a step of
   * its own — Overview uses it to decide whether "Live" is a claim this
   * account has actually earned.
   */
  assistantSynchronized: boolean | null;
  /**
   * From the saved assistant configuration: there is a prompt, and a greeting
   * whenever the assistant is the one who speaks first. An assistant set to
   * speak first with nothing to say is not a finished step.
   */
  promptReady: boolean | null;
  /** From the saved assistant configuration: a supported voice preset is chosen. */
  voiceChosen: boolean | null;
  /** At least one open weekday AND a timezone the server will accept. */
  availabilityConfigured: boolean | null;
  /**
   * At least one appointment type that is actually accepting bookings. A
   * catalogue of switched-off types books nobody.
   */
  appointmentTypesReady: boolean | null;
  /**
   * Connected, usable, and pointed at a chosen calendar. A withdrawn or
   * failing connection is not done — that is the difference between "set up"
   * and "working", and only the second earns a tick.
   */
  calendarReady: boolean | null;
  /** A number this firm owns whose state is exactly "assigned". */
  phoneAssigned: boolean | null;
  /** SiteMint holds a record of at least one real call. */
  testCallMade: boolean | null;
}

const NO_SIGNAL: SetupSignals = {
  businessComplete: null,
  emailVerified: null,
  assistantPublished: null,
  assistantSynchronized: null,
  promptReady: null,
  voiceChosen: null,
  availabilityConfigured: null,
  appointmentTypesReady: null,
  calendarReady: null,
  phoneAssigned: null,
  testCallMade: null,
};

export { NO_SIGNAL as EMPTY_SETUP_SIGNALS };

/** Shown wherever a step's own signal could not be read. */
export const NOT_CHECKED_DETAIL =
  "SiteMint couldn't check this just now. Open it to see where it stands.";

/**
 * The one signal each step is answered by, or `undefined` for a step no
 * signal can settle. Written as an exhaustive switch so a step added later
 * cannot silently inherit another step's answer.
 */
function signalFor(key: SetupStepKey, signals: SetupSignals): boolean | null | undefined {
  switch (key) {
    case "business":
      return signals.businessComplete;
    case "email_verified":
      return signals.emailVerified;
    case "assistant":
      return signals.assistantPublished;
    case "prompt":
      return signals.promptReady;
    case "voice":
      return signals.voiceChosen;
    case "availability":
      return signals.availabilityConfigured;
    case "appointment_types":
      return signals.appointmentTypesReady;
    case "calendar":
      return signals.calendarReady;
    case "test_call":
      return signals.testCallMade;
    case "phone_number":
      return signals.phoneAssigned;
    // Requesting activation is an action taken with SiteMint, not a capability
    // to measure, so it is only ever the server's saved record.
    case "review":
      return undefined;
  }
  // Unreachable while the switch covers the whole union, and written out so it
  // stays that way: a step key added without a case here answers "not checked"
  // rather than silently inheriting the saved tick.
  return undefined;
}

export interface SavedStep {
  status: StepStatus;
}

export type SavedSteps = Partial<Record<SetupStepKey, SavedStep>>;

/**
 * The status of every step, in order — and the single function both the Setup
 * hub and Overview read, so the two screens cannot disagree about whether an
 * account is ready.
 *
 * Derivation is authoritative; the saved tick is not. This used to treat a
 * stored `done` as final and let inference only ever upgrade toward it, which
 * meant a step stayed ticked long after the thing it described stopped being
 * true — a calendar whose access was withdrawn, a number that was released.
 * The live answer now wins:
 *
 *   - signal true    → `done`;
 *   - signal false   → `pending`, or `blocked` when the server recorded a
 *                      block (that carries a reason this page cannot
 *                      reconstruct, so it is preserved);
 *   - signal absent  → `unknown` — "not checked", and never `done`.
 *
 * Only `review` still comes from saved state, because it records an action
 * rather than a capability.
 */
export function deriveStepStatuses(
  saved: SavedSteps,
  signals: SetupSignals = NO_SIGNAL,
): Record<SetupStepKey, StepStatus> {
  const result = {} as Record<SetupStepKey, StepStatus>;
  for (const meta of SETUP_STEPS) {
    const savedStatus = saved[meta.key]?.status ?? "pending";
    const signal = signalFor(meta.key, signals);

    if (signal === undefined) {
      result[meta.key] = savedStatus;
    } else if (signal === true) {
      result[meta.key] = "done";
    } else if (signal === false) {
      result[meta.key] = savedStatus === "blocked" ? "blocked" : "pending";
    } else {
      result[meta.key] = "unknown";
    }
  }
  return result;
}

/**
 * Which of the inferable steps newly resolved to "done" by inference
 * alone (i.e. the server had not yet recorded them done). The caller `PUT`s
 * exactly these back — never the steps that were already saved done, so a
 * page load never issues a write when nothing changed.
 */
export function newlyInferredDone(saved: SavedSteps, signals: SetupSignals): SetupStepKey[] {
  return SETUP_STEPS.map((meta) => meta.key).filter(
    (key) => saved[key]?.status !== "done" && signalFor(key, signals) === true,
  );
}

export interface DisplayStep extends SetupStepMeta {
  status: DisplayStatus;
  blockedReason?: string;
}

/**
 * The full display list: combined statuses, with exactly one step (the
 * first not already done) promoted to "next" unless that step is itself
 * "blocked" — a blocked step is the thing that needs attention, so it keeps
 * its own label rather than being relabelled "next". Once the first
 * incomplete step is resolved (either way), no *later* step is promoted to
 * "next" either — a blocked step upstream is what genuinely needs attention,
 * and a later pending step is not truly reachable next while it stands.
 */
export function buildDisplaySteps(statuses: Record<SetupStepKey, StepStatus>): DisplayStep[] {
  let firstIncompleteSeen = false;
  return SETUP_STEPS.map((meta) => {
    const raw = statuses[meta.key];
    if (raw === "done") return { ...meta, status: "done" };
    if (raw === "blocked") {
      firstIncompleteSeen = true;
      return { ...meta, status: "blocked", blockedReason: BLOCKED_FALLBACK_REASON };
    }
    // A step SiteMint could not check keeps its own label rather than being
    // called "next": naming it the next thing to do would assert it is
    // outstanding, which is exactly what could not be established.
    if (raw === "unknown") {
      firstIncompleteSeen = true;
      return { ...meta, status: "unknown" };
    }
    // raw === "pending"
    if (!firstIncompleteSeen) {
      firstIncompleteSeen = true;
      return { ...meta, status: "next" };
    }
    return { ...meta, status: "pending" };
  });
}

export function progressLabel(statuses: Record<SetupStepKey, StepStatus>): string {
  const done = SETUP_STEPS.filter((s) => statuses[s.key] === "done").length;
  return `${done} of ${SETUP_STEPS.length}`;
}

export function isSetupComplete(statuses: Record<SetupStepKey, StepStatus>): boolean {
  // "review" is never auto-completed (no automatic activation), so completion
  // for the purpose of the review step means every *other* step is done.
  return SETUP_STEPS.filter((s) => s.key !== "review").every((s) => statuses[s.key] === "done");
}

export interface NextAction {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

/** The single next-action button (S-3: "one next action"). */
export function buildNextAction(display: DisplayStep[]): NextAction {
  // An unchecked step counts as somewhere to go. Without it, a page that could
  // not read one step would fall through to the "everything is complete"
  // branch below and congratulate the customer on a setup it never verified.
  const target = display.find(
    (s) => s.status === "next" || s.status === "blocked" || s.status === "unknown",
  );
  if (target?.status === "unknown") {
    return {
      title: target.title,
      detail: NOT_CHECKED_DETAIL,
      actionLabel: "Open this step",
      href: target.href ?? "#review",
    };
  }
  if (!target) {
    const review = display.find((s) => s.key === "review")!;
    return {
      title: "Setup is complete",
      detail: "Everything is configured. Review and request activation when you're ready.",
      actionLabel: "Go to final review",
      href: review.href ?? "#review",
    };
  }
  return {
    title: target.title,
    detail: target.status === "blocked" && target.blockedReason ? target.blockedReason : target.detail,
    actionLabel: target.status === "blocked" ? "See what's needed" : "Continue setup",
    href: target.href ?? "#review",
  };
}

export const ACTIVATE_DISABLED_REASON =
  "Activation is completed with SiteMint during private-beta onboarding.";

export interface ReviewSummary {
  doneTitles: string[];
  missingTitles: string[];
}

export function buildReviewSummary(display: DisplayStep[]): ReviewSummary {
  const rest = display.filter((s) => s.key !== "review");
  return {
    doneTitles: rest.filter((s) => s.status === "done").map((s) => s.title),
    missingTitles: rest.filter((s) => s.status !== "done").map((s) => s.title),
  };
}

export interface PageCopy {
  eyebrow: string;
  title: string;
  detail: string;
}

export function pageCopy(): PageCopy {
  return {
    eyebrow: "Setup",
    title: "Set up your receptionist",
    detail: "Complete these steps to get your AI Receptionist ready for private-beta activation.",
  };
}
