// ── M5: what the campaign workspace agrees about ─────────────────────────────
//
// One place for the API shapes, the request helper, and the handful of class
// strings the four steps share. Every call goes through `adminFetch`; nothing
// in this directory touches the platform `fetch` or the stored token.

import { adminFetch } from "@/lib/adminFetch";
import type { EmailBlock } from "@/components/crm/EmailDesigner";
import type { SegmentDefinition } from "@/components/crm/SegmentBuilder";

export type { EmailBlock };
export type { SegmentDefinition };

export type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "cancelled" | "sent";
export type AudienceMode = "segment" | "filter" | "list";

export interface Campaign {
  id: number;
  name: string;
  subject: string;
  preheader?: string | null;
  blocks: EmailBlock[];
  segmentId?: number | null;
  designId?: number | null;
  audienceMode?: AudienceMode | null;
  audienceDefinition?: SegmentDefinition | null;
  audienceLeadIds?: number[] | null;
  status: CampaignStatus;
  scheduledAt?: string | null;
  scheduledTimezone?: string | null;
  completedAt?: string | null;
  aiContentState: "none" | "draft" | "approved";
  aiApprovedByLabel?: string | null;
  createdByLabel?: string | null;
  updatedByLabel?: string | null;
  updatedAt: string;
  counts?: Record<string, number>;
  audienceLabel?: string;
}

export interface Segment {
  id: number;
  name: string;
  description?: string | null;
  definition: SegmentDefinition;
  memberCount?: number;
  createdByLabel?: string | null;
}

export interface Design {
  id: number;
  name: string;
  description?: string | null;
  subject?: string | null;
  preheader?: string | null;
  blocks: EmailBlock[];
  updatedAt?: string;
}

export interface Contact {
  id: number;
  name: string;
  email: string | null;
  company?: string | null;
  status?: string | null;
  source?: string | null;
  eligible: boolean;
  exclusionReason: string | null;
  exclusionLabel: string | null;
  exclusionDetail: string | null;
}

export interface ExclusionBucket {
  reason: string;
  label: string;
  count: number;
  contacts: { id?: number; leadId?: number; name: string; email?: string | null; detail?: string | null }[];
}

export interface AudiencePreview {
  mode: AudienceMode;
  label: string;
  problem: string | null;
  note: string | null;
  audienceSize: number;
  eligibleCount: number;
  excludedCount: number;
  eligible: { id: number; name: string; email: string | null; company: string | null }[];
  eligibleShown: number;
  excludedByReason: ExclusionBucket[];
  reevaluated: boolean;
}

export interface Preflight {
  audience: { mode: string; label: string; note: string | null };
  audienceSize: number;
  sendable: number;
  excluded: number;
  excludedByReason: ExclusionBucket[];
  fallbackWarnings: { field: string; count: number; share: number }[];
  blockers: string[];
  canSend: boolean;
  delivery: { configured: boolean; note: string };
}

export interface Results {
  counts: { audience: number; sent: number; failed: number; excluded: number; neverAttempted: number; testSends: number };
  excludedByReason: ExclusionBucket[];
  recipients: { id: number; leadId: number; name: string; address: string | null; status: string; lastError?: string | null; sentAt?: string | null }[];
  engagement: { tracked: boolean; why: string };
  deliverySignal: { meaning: string; providerIdsRecorded: number };
  definitions: Record<string, string>;
}

export interface MarketingSettings {
  autosend: { enabled: boolean; envVar: string; operatorNote: string; adminNote: string | null };
  delivery: { configured: boolean; operatorNote: string; adminNote: string | null };
  sender: { address: string; configuredExplicitly: boolean };
  testAddresses: { id: number; email: string; displayName: string | null }[];
  now: string;
  serverTimezone: string;
}

/**
 * Whether AI drafting can run, and what to say when it cannot.
 *
 * `reason` is the operator's sentence and carries no server vocabulary;
 * `adminDetail` is where variable names live and belongs behind a disclosure.
 * Both are optional here so this screen keeps working against a backend that
 * predates the split — in that case `reason` may still be the old combined
 * sentence, so the fallback below is used in the flow instead.
 */
export interface AiAvailability {
  available: boolean;
  reason?: string | null;
  adminDetail?: string | null;
  missing?: string[];
}

/** Plain language for the flow, never a variable name. */
export const AI_UNAVAILABLE_FALLBACK =
  "Drafting with AI is not switched on for this workspace. Everything else here works — "
  + "write the email yourself, or ask whoever looks after this system to turn it on.";

export function aiOperatorMessage(ai: AiAvailability | null): string {
  const reason = ai?.reason?.trim();
  // A message that names an environment variable is administrator detail that
  // leaked into the operator field; it is not shown in the flow.
  if (reason && !/[A-Z][A-Z0-9]*_[A-Z0-9_]{3,}/.test(reason)) return reason;
  return AI_UNAVAILABLE_FALLBACK;
}

export function aiAdminDetail(ai: AiAvailability | null): string | null {
  if (!ai) return null;
  if (ai.adminDetail) return ai.adminDetail;
  const reason = ai.reason?.trim();
  if (reason && /[A-Z][A-Z0-9]*_[A-Z0-9_]{3,}/.test(reason)) return reason;
  if (ai.missing?.length) return `Not set on this server: ${ai.missing.join(", ")}.`;
  return null;
}

// ── Requests ─────────────────────────────────────────────────────────────────

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T & Record<string, any>;
}

export async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await adminFetch(path, init);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as T & Record<string, any> };
}

export const postJson = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
export const patchJson = (body: unknown): RequestInit => ({
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

/** The message an operator should see when a request fails. */
export function failureText(r: ApiResult<unknown>, fallback: string): string {
  const err = r.data?.error;
  if (typeof err === "string" && err) return err;
  if (r.status === 0) return "The server did not answer. Check your connection and try again.";
  return `${fallback} (${r.status})`;
}

// ── Shared classes ───────────────────────────────────────────────────────────

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-700 text-white text-sm font-semibold rounded-lg "
  + "hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 px-3 py-2.5 border border-border text-sm font-semibold rounded-lg "
  + "text-foreground hover:bg-accent disabled:opacity-50 transition-colors min-h-[44px]";

export const btnQuiet =
  "inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-sm font-medium rounded-md "
  + "text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors min-h-[40px]";

export const inputClass =
  "w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm "
  + "focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60";

export const cardClass = "rounded-xl border border-border bg-card";

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatWhen(iso: string | null | undefined, timezone?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium", timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(d);
  } catch {
    return d.toISOString().replace("T", " ").slice(0, 16);
  }
}

export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

/** `2026-09-15T09:00` in the given zone → the UTC instant that local time means. */
export function zonedInputToIso(local: string, timezone: string): string | null {
  if (!local) return null;
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  try {
    // What clock the target zone shows at that UTC instant; the gap between
    // that and the instant itself is the offset to remove.
    const shown = new Date(naive.toLocaleString("en-US", { timeZone: timezone }));
    const utcShown = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
    return new Date(naive.getTime() + (utcShown.getTime() - shown.getTime())).toISOString();
  } catch {
    return naive.toISOString();
  }
}

/**
 * Whether a filter is complete enough to be worth sending to the server.
 *
 * A mirror of the server's own validation, and deliberately only a mirror: the
 * server is the authority and still refuses anything wrong. This exists so that
 * autosaving a half-typed condition does not fail the whole save and take the
 * subject line down with it — the filter is simply left out of that save, and
 * the screen says so.
 */
const NO_VALUE_OPERATORS = new Set(["is_set", "is_not_set"]);
const LIST_OPERATORS = new Set(["in", "not_in"]);

export function filterIsSavable(definition: SegmentDefinition | null | undefined): boolean {
  if (!definition || !Array.isArray(definition.conditions) || definition.conditions.length === 0) return false;
  return definition.conditions.every((c) => {
    if (!c.field || !c.operator) return false;
    if (NO_VALUE_OPERATORS.has(c.operator)) return true;
    if (LIST_OPERATORS.has(c.operator)) return Array.isArray(c.value) && c.value.length > 0;
    if (Array.isArray(c.value)) return c.value.length > 0;
    return c.value !== null && c.value !== undefined && String(c.value).trim() !== "";
  });
}

export const COMMON_TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "Europe/London", "Europe/Berlin", "Asia/Manila", "Asia/Singapore", "Australia/Sydney", "UTC",
];
