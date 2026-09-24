/**
 * A small status pill shared by Overview, Setup, Settings and Assistants.
 *
 * A status is always a word, never a colour alone: the label is rendered as
 * text and the tone only adds a second, non-exclusive signal. Styled by the
 * SiteMint Workspace system (`styles/workspace.css`, `ws-pill`), so the same
 * state looks the same on every page in light and dark appearance.
 */

export type StatusTone = "done" | "live" | "next" | "pending" | "blocked" | "warn" | "neutral";

/** Workspace pill tones: live (working), progress (in hand), attention, off, neutral. */
const PILL_TONE: Record<StatusTone, string> = {
  done: "live",
  live: "live",
  next: "progress",
  pending: "off",
  blocked: "attention",
  warn: "progress",
  neutral: "neutral",
};

export interface StatusChipProps {
  label: string;
  tone: StatusTone;
  /** Visually hidden context appended for assistive technology, e.g. "— done". */
  srSuffix?: string;
  /** Show a leading dot (used for the overall receptionist status). */
  dot?: boolean;
  /** Visually hidden context placed before the label, e.g. "Receptionist status: ". */
  srPrefix?: string;
}

export function StatusChip({ label, tone, srSuffix, dot, srPrefix }: StatusChipProps) {
  const pill = PILL_TONE[tone];
  return (
    <span className="ws-pill sd-tier" data-tone={pill}>
      {dot && <span className="ws-dot" data-tone={pill === "off" ? "neutral" : pill} aria-hidden="true" />}
      {srPrefix && <span className="sd-sr">{srPrefix}</span>}
      {label}
      {srSuffix && <span className="sd-sr">{srSuffix}</span>}
    </span>
  );
}
