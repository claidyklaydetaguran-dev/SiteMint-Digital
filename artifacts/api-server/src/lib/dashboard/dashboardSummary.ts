// The dashboard's figures, built only from records the business actually has.
//
// Every figure is either a number read from the database or `null` — "Not
// available" — when its source could not be read. Nothing is estimated,
// sampled or invented, and a zero is only ever a counted zero.

export interface CallFact {
  callId: string;
  channel: "telephone" | "browser" | "unknown";
  state: string;
  startedAt: Date;
  durationSec: number | undefined;
  callerNumberDisplay: string;
}

export interface MessageFact {
  id: number;
  topic: string;
  urgency: string;
  followUpStatus: string;
  callerName: string | null;
  createdAt: Date;
}

export interface BookingFact {
  publicId: string;
  status: string;
  startAt: Date;
  customerName: string | null;
  createdAt: Date;
}

export interface ContactFact {
  id: number;
  name: string | null;
  createdAt: Date;
}

export interface DashboardInputs {
  now: Date;
  timezone: string;
  calls: CallFact[] | null;
  messages: MessageFact[] | null;
  bookings: BookingFact[] | null;
  /** Contacts created recently (the page shows the last week). */
  contacts: ContactFact[] | null;
  /** Every contact the business has. */
  contactsTotal: number | null;
}

export interface SummaryCard {
  key: "calls_today" | "messages_open" | "bookings_upcoming" | "bookings_waiting" | "contacts_new";
  label: string;
  value: number | null;
  detail: string;
  href: string;
}

export interface TrendPoint {
  date: string;
  telephone: number;
  browser: number;
}

export interface ActivityItem {
  kind: "call" | "message" | "booking" | "contact";
  id: string;
  title: string;
  detail: string;
  at: string;
  href: string;
  urgent: boolean;
}

export interface DashboardSummary {
  generatedAt: string;
  timezone: string;
  cards: SummaryCard[];
  /** Calls per day for the last 14 days in the business's timezone, or null when calls couldn't be read. */
  trend: TrendPoint[] | null;
  activity: ActivityItem[];
  /** Which sources could not be read, so the page can say so. */
  unavailable: Array<"calls" | "messages" | "bookings" | "contacts">;
}

/** YYYY-MM-DD for an instant, in a timezone. Falls back to UTC for an unusable zone. */
export function dateKey(at: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

const DAY_MS = 86_400_000;
const CALL_STATE_WORDS: Record<string, string> = {
  completed: "Answered",
  in_progress: "In progress",
  ringing: "Ringing",
  queued: "Starting",
  failed: "Failed",
  no_answer: "Not answered",
  busy: "Busy",
  canceled: "Cancelled",
  provider_error: "Failed",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildDashboardSummary(input: DashboardInputs): DashboardSummary {
  const { now, timezone } = input;
  const today = dateKey(now, timezone);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const unavailable: DashboardSummary["unavailable"] = [];
  if (input.calls === null) unavailable.push("calls");
  if (input.messages === null) unavailable.push("messages");
  if (input.bookings === null) unavailable.push("bookings");
  if (input.contacts === null) unavailable.push("contacts");

  const callsToday = input.calls?.filter((c) => dateKey(c.startedAt, timezone) === today) ?? null;
  const openMessages = input.messages?.filter((m) => m.followUpStatus !== "resolved") ?? null;
  const urgentOpen = openMessages?.filter((m) => m.urgency === "urgent").length ?? 0;
  const upcoming =
    input.bookings?.filter((b) => b.status === "booked" && b.startAt.getTime() > now.getTime() && b.startAt.getTime() <= now.getTime() + 7 * DAY_MS) ?? null;
  const waiting = input.bookings?.filter((b) => b.status === "pending_review" || b.status === "requested") ?? null;
  const newContacts = input.contacts?.filter((c) => c.createdAt.getTime() >= weekAgo.getTime()) ?? null;

  const cards: SummaryCard[] = [
    {
      key: "calls_today",
      label: "Calls today",
      value: callsToday?.length ?? null,
      detail: callsToday
        ? `${plural(callsToday.filter((c) => c.state === "completed").length, "answered", "answered")} · ${plural(callsToday.filter((c) => c.channel === "browser").length, "test call", "test calls")}`
        : "Not available",
      href: "/activity/calls",
    },
    {
      key: "messages_open",
      label: "Messages to follow up",
      value: openMessages?.length ?? null,
      detail: openMessages ? (urgentOpen > 0 ? `${urgentOpen} marked urgent` : "None marked urgent") : "Not available",
      href: "/activity/inquiries",
    },
    {
      key: "bookings_upcoming",
      label: "Booked, next 7 days",
      value: upcoming?.length ?? null,
      detail: upcoming ? (upcoming.length > 0 ? `Next: ${upcoming.slice().sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0]!.startAt.toISOString()}` : "Nothing booked yet") : "Not available",
      href: "/scheduling/appointments",
    },
    {
      key: "bookings_waiting",
      label: "Requests waiting for you",
      value: waiting?.length ?? null,
      detail: waiting ? (waiting.length > 0 ? "Confirm or decline them" : "Nothing waiting") : "Not available",
      href: "/scheduling/appointments",
    },
    {
      key: "contacts_new",
      label: "New contacts this week",
      value: newContacts?.length ?? null,
      detail: input.contactsTotal !== null ? `${plural(input.contactsTotal, "contact", "contacts")} in total` : "Total not available",
      href: "/activity/contacts",
    },
  ];

  let trend: TrendPoint[] | null = null;
  if (input.calls) {
    const days: TrendPoint[] = [];
    const index = new Map<string, TrendPoint>();
    for (let i = 13; i >= 0; i--) {
      const key = dateKey(new Date(now.getTime() - i * DAY_MS), timezone);
      if (index.has(key)) continue; // a daylight-saving day can repeat a key
      const point = { date: key, telephone: 0, browser: 0 };
      index.set(key, point);
      days.push(point);
    }
    for (const call of input.calls) {
      const point = index.get(dateKey(call.startedAt, timezone));
      if (!point) continue;
      if (call.channel === "browser") point.browser += 1;
      else point.telephone += 1;
    }
    trend = days;
  }

  const activity: ActivityItem[] = [
    ...(input.calls ?? []).map((c) => ({
      kind: "call" as const,
      id: c.callId,
      title: c.channel === "browser" ? "Browser test call" : `Call from ${c.callerNumberDisplay}`,
      detail: `${CALL_STATE_WORDS[c.state] ?? "Status unknown"}${c.durationSec !== undefined ? ` · ${Math.round(c.durationSec)}s` : ""}`,
      at: c.startedAt.toISOString(),
      href: `/activity/calls/${encodeURIComponent(c.callId)}`,
      urgent: false,
    })),
    ...(input.messages ?? []).map((m) => ({
      kind: "message" as const,
      id: String(m.id),
      title: m.callerName ? `Message from ${m.callerName}` : "Message from a caller",
      detail: m.topic,
      at: m.createdAt.toISOString(),
      href: "/activity/inquiries",
      urgent: m.urgency === "urgent" && m.followUpStatus !== "resolved",
    })),
    ...(input.bookings ?? []).map((b) => ({
      kind: "booking" as const,
      id: b.publicId,
      title: b.status === "booked" ? "Appointment booked" : b.status === "pending_review" || b.status === "requested" ? "Appointment requested" : `Appointment ${b.status.replace(/_/g, " ")}`,
      detail: `${b.customerName ?? "A caller"} · ${b.startAt.toISOString()}`,
      at: b.createdAt.toISOString(),
      href: "/scheduling/appointments",
      urgent: false,
    })),
    ...(input.contacts ?? [])
      .filter((c) => c.createdAt.getTime() >= weekAgo.getTime())
      .map((c) => ({
        kind: "contact" as const,
        id: String(c.id),
        title: "New contact",
        detail: c.name ?? "Unnamed contact",
        at: c.createdAt.toISOString(),
        href: `/activity/contacts/${c.id}`,
        urgent: false,
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  return { generatedAt: now.toISOString(), timezone, cards, trend, activity, unavailable };
}
