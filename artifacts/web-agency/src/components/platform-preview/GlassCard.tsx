import { forwardRef, type HTMLAttributes } from "react";

/**
 * Dark translucent glass surface — the primary card primitive for the
 * five redesigned inner pages (Services/Portfolio/Pricing/About/Contact).
 * Replaces the flat `bg-[hsl(var(--sm-color-surface-default))]` white
 * cards those pages used before this redesign.
 *
 * Reuses the homepage's already-approved, already-contrast-verified
 * `--pp-navy-*`/`--pp-cyan-mint*` tokens (platform-preview.css) rather than
 * inventing a new palette — this is the same dark language `FinalCtaSection`
 * already uses today, just promoted to a reusable card instead of one
 * bespoke panel.
 *
 * `tone="elevated"` is a slightly lighter navy for the rare card that needs
 * to visually separate from an already-dark section behind it (e.g. the
 * featured portfolio project) — still dark, not a light/dark switch.
 */
export const GlassCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { tone?: "default" | "elevated" }>(
  function GlassCard({ tone = "default", className = "", style, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={`pp-glass-card group relative overflow-hidden rounded-[var(--sm-radius-lg)] border backdrop-blur-[14px] transition-all duration-300 hover:-translate-y-1 focus-within:-translate-y-1 ${className}`}
        style={{
          backgroundColor: tone === "elevated" ? "hsl(var(--pp-navy-700) / 0.55)" : "hsl(var(--pp-navy-800) / 0.55)",
          borderColor: "hsl(var(--pp-cyan-mint) / 0.16)",
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
