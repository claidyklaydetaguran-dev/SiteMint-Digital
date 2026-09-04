/**
 * V5 customer-shell foundation — the Setup hub's facts, as pure functions
 * (S-3: persistent guided onboarding, ten steps, one next action, no
 * automatic activation).
 *
 * Status for each step comes from two places, and they are combined
 * deliberately rather than either one winning outright:
 *
 *  1. **The saved onboarding state** (`GET/PUT /api/receptionist/onboarding`,
 *     `lib/onboardingApi.ts`) — the backend's own record of `pending` /
 *     `done` / `blocked` per step. This is authoritative once it exists.
 *  2. **Real-data inference**, for exactly the four steps the task brief
 *     names: business (firm name + industry present), availability (a
 *     config row exists), calendar (connected) and phone number (a number is
 *     assigned). A step already saved `blocked` stays `blocked` — inference
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

export type StepStatus = "pending" | "done" | "blocked";
export type DisplayStatus = "done" | "next" | "pending" | "blocked";

export interface SetupStepMeta {
  key: SetupStepKey;
  title: string;
  detail: string;
  /** Base-relative deep link, or null for the in-page review step. */
  href: string | null;
}

/** Order and copy for the ten steps, exactly as specified in S-3. */
export const SETUP_STEPS: SetupStepMeta[] = [
  {
    key: "business",
    title: "Business information",
    detail: "Tell SiteMint about your business so the receptionist can speak accurately about it.",
    href: "/account/settings",
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
    title: "Browser test call",
    detail: "Test your receptionist with a call from your browser before it goes live.",
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

/** The four steps the brief authorises inferring from real, already-loaded data. */
export interface SetupSignals {
  /** From agent-config: firm name and industry both present. */
  businessComplete: boolean | null;
  /** From the availability config query: a config row exists. */
  availabilityConfigured: boolean | null;
  /** From the calendar-status query. */
  calendarConnected: boolean | null;
  /** From the voice numbers query: at least one number is assigned to this firm. */
  phoneAssigned: boolean | null;
}

const NO_SIGNAL: SetupSignals = {
  businessComplete: null,
  availabilityConfigured: null,
  calendarConnected: null,
  phoneAssigned: null,
};

export { NO_SIGNAL as EMPTY_SETUP_SIGNALS };

function inferredDone(key: SetupStepKey, signals: SetupSignals): boolean {
  switch (key) {
    case "business":
      return signals.businessComplete === true;
    case "availability":
      return signals.availabilityConfigured === true;
    case "calendar":
      return signals.calendarConnected === true;
    case "phone_number":
      return signals.phoneAssigned === true;
    default:
      return false;
  }
}

export interface SavedStep {
  status: StepStatus;
}

export type SavedSteps = Partial<Record<SetupStepKey, SavedStep>>;

/**
 * The combined status for every step, in order. `done` wins over everything;
 * a saved `blocked` is preserved unless real data now proves it done; every
 * other case is `pending`.
 */
export function deriveStepStatuses(
  saved: SavedSteps,
  signals: SetupSignals = NO_SIGNAL,
): Record<SetupStepKey, StepStatus> {
  const result = {} as Record<SetupStepKey, StepStatus>;
  for (const meta of SETUP_STEPS) {
    const savedStatus = saved[meta.key]?.status ?? "pending";
    if (savedStatus === "done" || inferredDone(meta.key, signals)) {
      result[meta.key] = "done";
    } else {
      result[meta.key] = savedStatus;
    }
  }
  return result;
}

/**
 * Which of the four inferable steps newly resolved to "done" by inference
 * alone (i.e. the server had not yet recorded them done). The caller `PUT`s
 * exactly these back — never the steps that were already saved done, so a
 * page load never issues a write when nothing changed.
 */
export function newlyInferredDone(saved: SavedSteps, signals: SetupSignals): SetupStepKey[] {
  const keys: SetupStepKey[] = ["business", "availability", "calendar", "phone_number"];
  return keys.filter((key) => saved[key]?.status !== "done" && inferredDone(key, signals));
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
  const target = display.find((s) => s.status === "next" || s.status === "blocked");
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
