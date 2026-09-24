/**
 * V5 PR-8 — every string the Issues screen displays.
 *
 * Reads `GET /receptionist/voice/issues`, resolves one with
 * `POST /receptionist/voice/issues/:id/resolve`.
 *
 * Only some issues are the customer's to resolve. The server keeps the
 * allowlist (CUSTOMER_RESOLVABLE_ISSUE_CODES in voiceIssueService.ts), answers
 * 403 for the rest, and marks each listed issue with `customerResolvable` —
 * this page reads that flag rather than keeping a second copy of the list.
 */

import type { IssueLevel, VoiceIssue } from "@/lib/issuesApi";

export const PAGE = {
  eyebrow: "OBSERVE",
  title: "Issues",
  detail: "Problems SiteMint has detected with your AI receptionist.",
  loading: "Checking your session…",
} as const;

export const COPY = {
  errorTitle: "Issues couldn't be loaded",
  errorDetail: "SiteMint couldn't read your issues. Try again.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",

  allClearTitle: "All clear",
  allClearDetailPrefix: "No open issues. Last checked",

  occurrencesLabel: "Occurrences",
  firstSeenLabel: "First seen",
  lastSeenLabel: "Last seen",

  resolveLabel: "Resolve",
  resolvePendingLabel: "Resolving…",
  resolveConfirmTitle: "Mark this issue resolved?",
  resolveConfirmDetail: "SiteMint will stop showing this issue. It reappears if it happens again.",
  resolveConfirmAction: "Resolve",
  resolveConfirmDismiss: "Keep open",
  resolvedAnnouncement: "Issue resolved.",
  resolveFailedTitle: "This issue wasn't resolved",
  resolveFailedDetail: "Nothing changed. Try again.",

  operatorOnlyNote: "SiteMint resolves this one for you.",
} as const;

/** Show the Resolve action only when the server said it will accept it. */
export function canResolve(issue: Pick<VoiceIssue, "customerResolvable">): boolean {
  return issue.customerResolvable === true;
}

const LEVEL_LABEL: Record<IssueLevel, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
  critical: "Critical",
};

export function levelLabel(level: string): string {
  return LEVEL_LABEL[level as IssueLevel] ?? "Notice";
}

export function everyRenderableString(): string[] {
  return [...Object.values(PAGE), ...Object.values(COPY), ...Object.values(LEVEL_LABEL), levelLabel("unknown")];
}
