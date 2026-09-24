/**
 * V5 PR-8 — every string and every rule the Usage screen displays.
 *
 * Reads `GET /receptionist/voice/usage?period=YYYY-MM`, which reports counts
 * only — `{ period, callCount, totalSeconds, includedMinutes }`. Cap/pause
 * *state* is not exposed by this endpoint (see the brief: "cap state is not
 * exposed to customers yet"), so `isPaused` is a derived estimate, not a
 * value the server asserted, and is labelled that way rather than as fact.
 */

import type { UsageChannelBucket, UsagePeriod } from "@/lib/usageApi";
import { supportMailto } from "../support/supportContract";

export const PAGE = {
  eyebrow: "ACCOUNT",
  title: "Usage",
  detail: "Minutes used by your AI receptionist this billing period.",
  loading: "Checking your session…",
} as const;

export const COPY = {
  errorTitle: "Usage couldn't be loaded",
  errorDetail: "SiteMint couldn't read your usage for this period. Try again.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",

  billingPeriodLabel: "Billing period",
  callsLabel: "Calls",
  minutesUsedLabel: "Minutes used",
  includedLabel: "Included minutes",
  includedUnlimited: "No limit set",
  remainingLabel: "Minutes remaining",
  remainingUnlimited: "Not limited",

  warningTitle: "Approaching your included minutes",
  warningDetail: "You've used most of your included minutes for this period.",

  /* ── How the period's calls arrived ──────────────────────────────────────
     Voice minutes and text-message conversations are separate allowances and
     are never added together. This block describes the MINUTES only. */
  channelsHeading: "How these calls arrived",
  channelTelephone: "Phone calls",
  channelBrowser: "Browser tests",
  /* Both the explicit "unknown" channel and rows carrying none. Neither can
     honestly be counted as a phone call or as a browser test. */
  channelUnreported: "Call type not reported",
  channelsUnavailable: "A breakdown by call type isn't available for this period.",

  pausedTitle: "Your receptionist is paused because the current usage limit was reached.",
  pausedAction: "Contact SiteMint to continue",
  // The same address Support shows — see pages/support/supportContract.ts.
  pausedMailto: supportMailto("Usage limit reached"),
} as const;

export const WARNING_THRESHOLD = 0.8;

/** `null` when there's no included-minutes cap to measure against. */
export function percentUsed(usage: Pick<UsagePeriod, "totalSeconds" | "includedMinutes">): number | null {
  if (usage.includedMinutes === null || usage.includedMinutes <= 0) return null;
  return (usage.totalSeconds / 60) / usage.includedMinutes;
}

export function isWarning(usage: Pick<UsagePeriod, "totalSeconds" | "includedMinutes">): boolean {
  const pct = percentUsed(usage);
  return pct !== null && pct >= WARNING_THRESHOLD && pct < 1;
}

/** Derived, never asserted by the server. See the module doc. */
export function isPaused(usage: Pick<UsagePeriod, "totalSeconds" | "includedMinutes">): boolean {
  const pct = percentUsed(usage);
  return pct !== null && pct >= 1;
}

export function minutesUsed(usage: Pick<UsagePeriod, "totalSeconds">): number {
  return Math.floor(usage.totalSeconds / 60);
}

export function minutesRemaining(usage: Pick<UsagePeriod, "totalSeconds" | "includedMinutes">): number | null {
  if (usage.includedMinutes === null) return null;
  return Math.max(0, usage.includedMinutes - minutesUsed(usage));
}

export function periodLabel(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/* ── Rail indicator (compact, mounted by the lead in the sidebar) ───────── */

export function railMinutesLabel(usage: UsagePeriod): string {
  const used = minutesUsed(usage);
  return usage.includedMinutes === null ? `${used} min used` : `${used} / ${usage.includedMinutes} min`;
}

/**
 * The SMS half of the rail.
 *
 * This counter is NOT voice. It counts text-message (SMS) intake
 * conversations, and it counts them for the life of the account — the trial
 * allowance is all-time, not per billing period. It used to read simply
 * "conversations" beside a minutes figure, which let a voice business read it
 * as calls this month; it was neither.
 */
export function railSmsLabel(conversationCount: number, trialConversationsLimit: number): string {
  return trialConversationsLimit > 0
    ? `${conversationCount} / ${trialConversationsLimit} SMS conversations, all time`
    : `${conversationCount} SMS conversations, all time`;
}

/** Whole minutes for one channel bucket. Seconds are floored, never rounded up. */
export function channelMinutes(bucket: UsageChannelBucket | undefined): number {
  if (!bucket) return 0;
  return Math.floor(bucket.totalSeconds / 60);
}

/**
 * The buckets in reading order, or null when the server produced no split.
 * Null is not the same as a period with no calls, and the page says so.
 */
export function channelRows(
  usage: Pick<UsagePeriod, "channels">,
): ReadonlyArray<{ key: string; label: string; minutes: number; callCount: number }> | null {
  const channels = usage.channels;
  if (!channels) return null;
  return [
    { key: "telephone", label: COPY.channelTelephone, minutes: channelMinutes(channels.telephone), callCount: channels.telephone?.callCount ?? 0 },
    { key: "browser", label: COPY.channelBrowser, minutes: channelMinutes(channels.browser), callCount: channels.browser?.callCount ?? 0 },
    { key: "unreported", label: COPY.channelUnreported, minutes: channelMinutes(channels.unreported), callCount: channels.unreported?.callCount ?? 0 },
  ];
}

export function everyRenderableString(): string[] {
  return [...Object.values(PAGE), ...Object.values(COPY)];
}
