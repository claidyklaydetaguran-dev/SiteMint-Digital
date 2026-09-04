/**
 * V5 customer-shell foundation — the single "one next-best-action" surface
 * used by Overview (D-1) and the Setup hub (S-3). Deliberately singular:
 * callers pass exactly one action, never a list, so the dashboard cannot
 * regress into a wall of competing buttons.
 */

import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export interface NextActionCardProps {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

export function NextActionCard({ title, detail, actionLabel, href }: NextActionCardProps) {
  return (
    <section
      aria-labelledby="sd-next-action-title"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--sd-space-4, 1rem)",
        padding: "var(--sd-space-5, 1.25rem)",
        border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
        borderRadius: "var(--sd-radius-card, 10px)",
        background: "var(--sm-mint-100, var(--sd-surface-accent, #f0f9f6))",
      }}
    >
      <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
        <h2
          id="sd-next-action-title"
          style={{
            margin: 0,
            fontSize: "var(--sd-text-h2, .9375rem)",
            fontWeight: 600,
            color: "var(--sd-text, #051824)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "2px 0 0",
            fontSize: "var(--sd-text-small, .8125rem)",
            lineHeight: 1.5,
            color: "var(--sd-text-muted, #3b5265)",
          }}
        >
          {detail}
        </p>
      </div>
      <Link
        href={href}
        style={{
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 44,
          padding: "0 var(--sd-space-4, 1rem)",
          borderRadius: "var(--sd-radius-control, 6px)",
          background: "var(--sm-mint-500, var(--sd-accent, #27e9b5))",
          color: "var(--sm-mint-700, var(--sd-accent-ink, #051824))",
          fontSize: "var(--sd-text-small, .8125rem)",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {actionLabel}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
