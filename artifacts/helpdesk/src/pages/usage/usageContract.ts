/**
 * V5 PR-8 — every string and every rule the Usage screen displays.
 *
 * Reads `GET /receptionist/voice/usage?period=YYYY-MM`, which reports counts
 * only — `{ period, callCount, totalSeconds, includedMinutes }`. Cap/pause
 * *state* is not exposed by this endpoint (see the brief: "cap state is not
 * exposed to customers yet"), so `isPaused` is a derived estimate, not a
 * value the server asserted, and is labelled that way rather than as fact.
 */

import type { UsagePeriod } from "@/lib/usageApi";

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

  pausedTitle: "Your receptionist is paused because the current usage limit was reached.",
  pausedAction: "Contact SiteMint to continue",
  pausedMailto: "mailto:support@sitemintdigital.com?subject=Usage%20limit%20reached",
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

export function railSmsLabel(conversationCount: number, trialConversationsLimit: number): string {
  return trialConversationsLimit > 0
    ? `${conversationCount} / ${trialConversationsLimit} conversations`
    : `${conversationCount} conversations`;
}

export function everyRenderableString(): string[] {
  return [...Object.values(PAGE), ...Object.values(COPY)];
}
