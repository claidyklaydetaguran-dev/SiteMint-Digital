/**
 * Shared UI helpers for the Receptionist Ops console (internal SiteMint
 * staff pages under /admin/ops/*). Kept local to this directory rather than
 * a workspace-wide module — small, self-contained, and only used here.
 *
 * These pages talk to voice/ops backend routes that may not exist yet on
 * an older deployment. Every field on every response is treated as
 * optional/nullable — never assume presence, fall back to "—" / "Not
 * available" instead of crashing.
 */

import { RefreshCw } from "lucide-react";

// ── Loading / empty / error / denied / not-provided states ────────────────────

export function OpsSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
    </div>
  );
}

export function OpsEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
      <p className="text-muted-foreground font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground/70 mt-1">{hint}</p>}
    </div>
  );
}

export function OpsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between gap-3 flex-wrap">
      <span>{message}</span>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}

export function OpsDenied() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-muted-foreground">
      You don't have access to this.
    </div>
  );
}

export function OpsNotProvided({ thing }: { thing: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-muted-foreground">
      This backend does not provide {thing} yet.
    </div>
  );
}

// ── Badges ──────────────────────────────────────────────────────────────────────

type BadgeColor = "green" | "amber" | "red" | "gray" | "blue";

const BADGE_STYLES: Record<BadgeColor, string> = {
  green: "bg-green-100 text-green-700 border border-green-200",
  amber: "bg-amber-100 text-amber-700 border border-amber-200",
  red: "bg-red-100 text-red-700 border border-red-200",
  gray: "bg-gray-100 text-gray-600 border border-gray-200",
  blue: "bg-blue-100 text-blue-700 border border-blue-200",
};

export function Badge({ label, color }: { label: string; color: BadgeColor }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${BADGE_STYLES[color]}`}>
      {label}
    </span>
  );
}

/** Issue severity badge. Case-insensitive, with a safe gray default for unknown levels. */
export function levelBadge(level?: string | null) {
  const v = (level ?? "").toLowerCase();
  if (v === "critical" || v === "error" || v === "fatal") return <Badge label={level || "Error"} color="red" />;
  if (v === "warning" || v === "warn") return <Badge label={level || "Warning"} color="amber" />;
  if (v === "info" || v === "notice") return <Badge label={level || "Info"} color="blue" />;
  return <Badge label={level || "Unknown"} color="gray" />;
}

/** Firm health chip for the Firms list — conversation usage vs trial limit. */
export function firmHealthBadge(conversationCount?: number | null, limit?: number | null) {
  if (conversationCount == null || limit == null || limit <= 0) return <Badge label="No data" color="gray" />;
  const ratio = conversationCount / limit;
  if (ratio >= 0.9) return <Badge label="Near limit" color="amber" />;
  return <Badge label="Healthy" color="green" />;
}

/** Generic state badge (subscription state, cap state, number state, ...). */
export function stateBadge(state?: string | null) {
  const v = (state ?? "").toLowerCase();
  if (!v) return <Badge label="Not reported" color="gray" />;
  if (["active", "assigned", "ok", "healthy", "provisioned", "current"].includes(v)) {
    return <Badge label={state as string} color="green" />;
  }
  if (["paused", "pending", "warning", "trialing"].includes(v)) {
    return <Badge label={state as string} color="amber" />;
  }
  if (["failed", "error", "cancelled", "canceled", "suspended", "past_due"].includes(v)) {
    return <Badge label={state as string} color="red" />;
  }
  return <Badge label={state as string} color="gray" />;
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatSeconds(totalSeconds?: number | null): string {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}

/** Current calendar month as YYYY-MM, for the Usage page's period selector default. */
export function currentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}
