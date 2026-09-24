import type { CSSProperties } from "react";

/**
 * The one arrow used across the Mint public site (launch follow-up,
 * 2026-09-24). The previous text glyphs (U+2197 "↗", "→", "↓", "↑") have
 * emoji presentation on iOS and rendered as coloured emoji inside buttons.
 *
 * Inline SVG, stroke = currentColor, so it takes the button's text colour in
 * every state (default, hover, focus, disabled). Always `aria-hidden`: the
 * accompanying text names the action, the arrow only decorates it.
 */
export type MintArrowDirection = "up-right" | "right" | "down" | "up";

const ROTATION: Record<MintArrowDirection, number> = { "up-right": 0, right: 45, down: 135, up: -45 };

export function MintArrow({
  direction = "up-right",
  size = 16,
  className,
  style,
}: {
  direction?: MintArrowDirection;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className ? `mint-arrow ${className}` : "mint-arrow"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ transform: `rotate(${ROTATION[direction]}deg)`, ...style }}
    >
      <path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
    </svg>
  );
}
