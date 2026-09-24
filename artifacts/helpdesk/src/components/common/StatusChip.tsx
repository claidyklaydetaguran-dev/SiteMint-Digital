/**
 * V5 customer-shell foundation — a small status pill shared by Setup, Overview
 * and Settings.
 *
 * A status is always a word, never a colour alone: the label is rendered as
 * text and the tone only adds a second, non-exclusive signal. Colours are
 * read from the `--sm-*` (V5 mint) token names first — so the moment
 * `tokens-v5.css` lands (V5-BLUEPRINT.md §2, PR-1) this component picks the
 * approved palette up with no code change — and fall back to the `--sd-*`
 * semantic roles already defined on `.sd-app` in `v2-dashboard.css`, which
 * this file does not have permission to edit or import from directly.
 */

export type StatusTone = "done" | "live" | "next" | "pending" | "blocked" | "warn" | "neutral";

const TONE_STYLE: Record<StatusTone, { color: string; background: string; border: string }> = {
  done: {
    color: "var(--sm-mint-700, var(--sd-accent-ink, #051824))",
    background: "var(--sm-mint-500, var(--sd-accent, #27e9b5))",
    border: "transparent",
  },
  live: {
    color: "var(--sm-mint-700, var(--sd-accent-ink, #051824))",
    background: "var(--sm-mint-500, var(--sd-accent, #27e9b5))",
    border: "transparent",
  },
  next: {
    color: "var(--sm-mint-700, var(--sd-text, #051824))",
    background: "transparent",
    border: "var(--sm-mint-500, var(--sd-accent, #27e9b5))",
  },
  pending: {
    color: "var(--sd-muted-text, #5c7181)",
    background: "var(--sd-muted-surface, #f6fbfa)",
    border: "var(--sd-border-strong, rgba(59,82,101,.24))",
  },
  blocked: {
    color: "var(--sm-amber-600, var(--sd-warn, #8a5200))",
    background: "var(--sm-amber-100, var(--sd-warn-surface, #fdf6ec))",
    border: "var(--sd-warn-border, rgba(138,82,0,.28))",
  },
  warn: {
    color: "var(--sm-amber-600, var(--sd-warn, #8a5200))",
    background: "var(--sm-amber-100, var(--sd-warn-surface, #fdf6ec))",
    border: "var(--sd-warn-border, rgba(138,82,0,.28))",
  },
  neutral: {
    color: "var(--sd-text-muted, #3b5265)",
    background: "transparent",
    border: "var(--sd-border-strong, rgba(59,82,101,.24))",
  },
};

export interface StatusChipProps {
  label: string;
  tone: StatusTone;
  /** Visually hidden context appended for assistive technology, e.g. "— done". */
  srSuffix?: string;
}

export function StatusChip({ label, tone, srSuffix }: StatusChipProps) {
  const style = TONE_STYLE[tone];
  return (
    <span
      className="sd-tier"
      data-tone={tone}
      style={{
        color: style.color,
        background: style.background,
        borderColor: style.border,
      }}
    >
      {label}
      {srSuffix && <span className="sd-sr">{srSuffix}</span>}
    </span>
  );
}
