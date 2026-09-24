// Is this business's receptionist ready — and if not, what is the next thing
// to do? One server-owned answer, read by the four-step setup and by the
// dashboard, so the two can never disagree.
//
// Setup has four steps:
//   1. Business information   — name, trade, timezone, a confirmed email.
//   2. Greeting and voice     — an assistant with a greeting and a voice this
//                               environment can publish.
//   3. What it can do         — messages always; booking and transfer only
//                               when the business turned them on, and then
//                               only once they are complete.
//   4. Test and activate      — published, a browser test call, a phone
//                               number, and a real inbound call.
//
// The overall state is one of:
//   setting_up · ready_to_test · ready_to_activate_phone · phone_connected ·
//   live_call_verified · paused · needs_attention · not_checked
//
// Every fact is `true | false | null`. `null` means SiteMint could not find
// out, and it is shown as "Not checked" — never folded into done or not done.

export type Fact = boolean | null;

export interface ReadinessFacts {
  businessNamed: Fact;
  businessTradeSet: Fact;
  timezoneSet: Fact;
  emailVerified: Fact;

  assistantExists: Fact;
  greetingSet: Fact;
  /** The saved voice and response style are ones this environment can publish. */
  voiceAvailable: Fact;
  /** The latest assistant is in the provider error state. */
  assistantErrored: Fact;

  /**
   * Booking, as the business has configured it: "off" (nothing set up — not
   * a requirement), "partial" (started but something is missing), "on".
   */
  booking: "off" | "partial" | "on" | null;
  /** First missing booking requirement, when partial. */
  bookingGap: "appointment_type" | "opening_hours" | "timezone" | null;
  calendarState: "not_connected" | "revoked" | "failing" | "untested" | "healthy" | null;
  transfer: "off" | "on" | null;

  published: Fact;
  /** The provider is running what is saved. */
  inSync: Fact;
  browserTestCompleted: Fact;
  phoneState: "none" | "assigned" | "paused" | null;
  liveCallCompleted: Fact;
}

export type CheckState = "done" | "todo" | "attention" | "not_checked" | "off";

export interface ReadinessCheck {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  /** Dashboard path that fixes it, when there is one. */
  fixPath: string | null;
}

export type StepKey = "business" | "greeting_voice" | "capabilities" | "test_activate";

export interface ReadinessStep {
  key: StepKey;
  number: 1 | 2 | 3 | 4;
  title: string;
  summary: string;
  state: "done" | "current" | "upcoming" | "attention" | "not_checked";
  checks: ReadinessCheck[];
}

export type OverallState =
  | "setting_up"
  | "ready_to_test"
  | "ready_to_activate_phone"
  | "phone_connected"
  | "live_call_verified"
  | "paused"
  | "needs_attention"
  | "not_checked";

export interface Readiness {
  state: OverallState;
  label: string;
  detail: string;
  next: { label: string; path: string } | null;
  steps: ReadinessStep[];
  checkedAt: string;
}

export const OVERALL_COPY: Record<OverallState, { label: string; detail: string }> = {
  setting_up: { label: "Setting up", detail: "Finish the steps below, then test your receptionist in the browser." },
  ready_to_test: { label: "Ready to test", detail: "Your receptionist is published. Talk to it in the browser before connecting a phone number." },
  ready_to_activate_phone: { label: "Ready to activate phone", detail: "Your test call worked. Connect a phone number so callers can reach it." },
  phone_connected: { label: "Phone connected", detail: "Your number is connected. Call it once to confirm a real call is answered." },
  live_call_verified: { label: "Live call verified", detail: "A real call to your number was answered. Check current connections before relying on booking or notifications." },
  paused: { label: "Paused", detail: "Your phone number is paused, so calls are not being answered. Resume it when you're ready." },
  needs_attention: { label: "Needs attention", detail: "Something stopped working. Fix the item marked below." },
  not_checked: { label: "Not checked", detail: "SiteMint couldn't check everything just now. Try again in a moment." },
};

function check(key: string, label: string, fact: Fact, doneDetail: string, todoDetail: string, fixPath: string | null): ReadinessCheck {
  if (fact === null) return { key, label, state: "not_checked", detail: "Not checked — SiteMint couldn't read this just now.", fixPath };
  return fact ? { key, label, state: "done", detail: doneDetail, fixPath: null } : { key, label, state: "todo", detail: todoDetail, fixPath };
}

function stepState(checks: ReadinessCheck[]): "done" | "attention" | "not_checked" | "incomplete" {
  const relevant = checks.filter((c) => c.state !== "off");
  if (relevant.some((c) => c.state === "attention")) return "attention";
  if (relevant.every((c) => c.state === "done")) return "done";
  if (relevant.some((c) => c.state === "not_checked") && relevant.every((c) => c.state === "done" || c.state === "not_checked")) return "not_checked";
  return "incomplete";
}

const BOOKING_GAP_COPY = {
  appointment_type: "Add an appointment type that accepts bookings.",
  opening_hours: "Set at least one day of opening hours.",
  timezone: "Set your business timezone.",
} as const;

/** Pure: facts in, the whole readiness answer out. */
export function deriveReadiness(f: ReadinessFacts, now: Date = new Date()): Readiness {
  const business: ReadinessCheck[] = [
    check("business_name", "Business name", f.businessNamed, "Saved.", "Add your business name.", "/account/settings"),
    check("business_trade", "What your business does", f.businessTradeSet, "Saved.", "Say what your business does, so the receptionist can describe it.", "/account/settings"),
    check("timezone", "Timezone", f.timezoneSet, "Saved.", "Choose your timezone, so times are right.", "/account/settings"),
    check("email", "Confirmed email", f.emailVerified, "Email address confirmed. This does not verify summary delivery.", "Confirm your email address. Nothing is sent to an unconfirmed address.", "/verify-email"),
  ];

  const greeting: ReadinessCheck[] = [
    check("assistant", "Receptionist created", f.assistantExists, "Created.", "Create your receptionist.", "/assistants"),
    check("greeting", "Greeting", f.greetingSet, "Saved.", "Write what callers hear first.", "/assistants"),
    // A saved choice the environment no longer offers is a problem to fix; no
    // receptionist yet is simply the next thing to do.
    f.voiceAvailable === false && f.assistantExists === true
      ? { key: "voice", label: "Voice", state: "attention", detail: "The saved voice or response style isn't available. Choose one from the list.", fixPath: "/assistants" }
      : check("voice", "Voice", f.voiceAvailable, "Chosen.", "Choose a voice.", "/assistants"),
  ];

  const bookingCheck: ReadinessCheck =
    f.booking === null
      ? { key: "booking", label: "Book appointments", state: "not_checked", detail: "Not checked — SiteMint couldn't read your booking setup.", fixPath: "/scheduling/availability" }
      : f.booking === "off"
        ? { key: "booking", label: "Book appointments", state: "off", detail: "Off. Add an appointment type and opening hours to turn it on.", fixPath: "/scheduling/appointment-types" }
        : f.booking === "partial"
          ? { key: "booking", label: "Book appointments", state: "attention", detail: BOOKING_GAP_COPY[f.bookingGap ?? "appointment_type"], fixPath: f.bookingGap === "appointment_type" ? "/scheduling/appointment-types" : "/scheduling/availability" }
          : f.calendarState === "revoked" || f.calendarState === "failing"
            ? { key: "booking", label: "Book appointments", state: "attention", detail: "Your calendar connection isn't working, so bookings can't be added to it. Reconnect it.", fixPath: "/scheduling/calendar" }
            : f.calendarState === "healthy" || f.calendarState === "untested"
              ? { key: "booking", label: "Book appointments", state: "done", detail: "On. Confirmed bookings go straight into your calendar.", fixPath: null }
              : { key: "booking", label: "Book appointments", state: "done", detail: "On. Without a connected calendar, requests wait for you to confirm.", fixPath: "/scheduling/calendar" };

  const capabilities: ReadinessCheck[] = [
    { key: "messages", label: "Take messages", state: "done", detail: "Always on. Callers can leave their details and what they need.", fixPath: null },
    bookingCheck,
    f.transfer === null
      ? { key: "transfer", label: "Transfer calls", state: "not_checked", detail: "Not checked — SiteMint couldn't read your transfer contacts.", fixPath: "/channels/transfer-contacts" }
      : f.transfer === "on"
        ? { key: "transfer", label: "Transfer calls", state: "done", detail: "On. Callers can be put through to a consenting contact.", fixPath: null }
        : { key: "transfer", label: "Transfer calls", state: "off", detail: "Off. Add a contact who agreed to take calls, and test it with them, to turn it on.", fixPath: "/channels/transfer-contacts" },
  ];

  const errored = f.assistantErrored === true;
  const testing: ReadinessCheck[] = [
    errored
      ? { key: "published", label: "Published", state: "attention", detail: "The last publish failed. Open your receptionist and publish again.", fixPath: "/assistants" }
      : f.published === true && f.inSync === false
        ? { key: "published", label: "Published", state: "attention", detail: "You have changes that aren't live yet. Publish to apply them.", fixPath: "/assistants" }
        : check("published", "Published", f.published, "Live with your latest changes.", "Publish your receptionist.", "/assistants"),
    check("browser_test", "Browser test call", f.browserTestCompleted, "A test call completed.", "Talk to your receptionist in the browser.", "/assistants"),
    f.phoneState === null
      ? { key: "phone", label: "Phone number", state: "not_checked", detail: "Not checked — SiteMint couldn't read your numbers.", fixPath: "/channels/phone-number" }
      : f.phoneState === "paused"
        ? { key: "phone", label: "Phone number", state: "attention", detail: "Paused. Calls aren't answered until you resume it.", fixPath: "/channels/phone-number" }
        : f.phoneState === "assigned"
          ? { key: "phone", label: "Phone number", state: "done", detail: "Connected.", fixPath: null }
          : { key: "phone", label: "Phone number", state: "todo", detail: "Connect a phone number after your test call.", fixPath: "/channels/phone-number" },
    check("live_call", "First real call", f.liveCallCompleted, "A real call to your number was answered.", "Call your number once to confirm it answers.", "/activity/calls"),
  ];

  const groups: Array<{ key: StepKey; number: 1 | 2 | 3 | 4; title: string; summary: string; checks: ReadinessCheck[] }> = [
    { key: "business", number: 1, title: "Business information", summary: "Who you are and where to reach you.", checks: business },
    { key: "greeting_voice", number: 2, title: "Greeting and voice", summary: "What callers hear, and how it sounds.", checks: greeting },
    { key: "capabilities", number: 3, title: "What it can do", summary: "Messages are always on. Booking and transfer are optional.", checks: capabilities },
    { key: "test_activate", number: 4, title: "Test and activate", summary: "Publish, test in the browser, then connect a number.", checks: testing },
  ];

  let currentAssigned = false;
  const steps: ReadinessStep[] = groups.map((g) => {
    const s = stepState(g.checks);
    let state: ReadinessStep["state"];
    if (s === "done") state = "done";
    else if (s === "attention") state = "attention";
    else if (s === "not_checked") state = "not_checked";
    else if (!currentAssigned) state = "current";
    else state = "upcoming";
    if (state !== "done") currentAssigned = true;
    return { ...g, state };
  });

  const all = steps.flatMap((s) => s.checks);
  const firstAttention = all.find((c) => c.state === "attention");
  const firstTodo = all.find((c) => c.state === "todo");
  const byKey = (k: string) => all.find((c) => c.key === k)!;
  const setupDone = steps.slice(0, 3).every((s) => s.state === "done");

  let state: OverallState;
  if (f.phoneState === "paused") state = "paused";
  else if (firstAttention) state = "needs_attention";
  else if (f.liveCallCompleted === true && f.phoneState === "assigned") state = "live_call_verified";
  else if (f.phoneState === "assigned" && f.published === true) state = "phone_connected";
  else if (setupDone && f.published === true && f.browserTestCompleted === true) state = "ready_to_activate_phone";
  else if (setupDone && f.published === true) state = "ready_to_test";
  else if (all.some((c) => c.state === "not_checked") && !firstTodo) state = "not_checked";
  else state = "setting_up";

  // The single next action: what needs fixing first, otherwise the first
  // outstanding item, in step order.
  const nextCheck =
    firstAttention ??
    (state === "ready_to_test" ? byKey("browser_test") : state === "ready_to_activate_phone" ? byKey("phone") : state === "phone_connected" ? byKey("live_call") : firstTodo);
  const next =
    nextCheck && nextCheck.fixPath && nextCheck.state !== "done"
      ? { label: nextCheck.state === "attention" ? `Fix: ${nextCheck.label}` : nextCheck.label, path: nextCheck.fixPath }
      : null;

  return { state, ...OVERALL_COPY[state], next, steps, checkedAt: now.toISOString() };
}
