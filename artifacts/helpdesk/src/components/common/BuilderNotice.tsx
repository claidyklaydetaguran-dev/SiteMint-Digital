import { Info } from "lucide-react";

/**
 * Persistent notice that nothing in the builder is saved yet. Shown on every
 * section of the unsaved builder — never success wording.
 *
 * Presentation only: the dashboard's own attention block, built from `--sd-*`
 * tokens, rather than utility classes of its own.
 */
export function BuilderNotice() {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--sd-space-3, .75rem)",
        padding: "var(--sd-space-4, 1rem) var(--sd-space-5, 1.25rem)",
        border: "1px solid var(--sd-warn-border, rgba(138,82,0,.28))",
        borderLeftWidth: 3,
        borderRadius: "var(--sd-radius-card, 10px)",
        background: "var(--sd-warn-surface, #fdf6ec)",
        minWidth: 0,
      }}
    >
      <Info
        aria-hidden="true"
        style={{ flex: "0 0 auto", width: 18, height: 18, marginTop: 1, color: "var(--sd-warn, #8a5200)" }}
      />
      <div style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: "var(--sd-text-body, .875rem)",
            fontWeight: 600,
            color: "var(--sd-text, #051824)",
          }}
        >
          Not saved yet
        </span>
        <p
          style={{
            margin: "2px 0 0",
            fontSize: "var(--sd-text-small, .8125rem)",
            lineHeight: 1.5,
            color: "var(--sd-warn, #8a5200)",
          }}
        >
          Nothing you change here is kept until you choose Save changes.
        </p>
      </div>
    </div>
  );
}
