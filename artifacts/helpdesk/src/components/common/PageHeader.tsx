/**
 * V5 customer-shell foundation — a page head with a title, a one-line purpose
 * statement, an optional breadcrumb slot (C-6 / D-2 breadcrumbs) and an
 * optional primary-action slot. Reuses the `sd-page__head` / `sd-page__title`
 * / `sd-eyebrow` classes already shipped in `v2-dashboard.css` so it drops
 * into any page inside `DashboardShell` without a new stylesheet.
 */

import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  /** One line: what this page is for. Never promotional. */
  description?: string;
  eyebrow?: string;
  breadcrumb?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, breadcrumb, action }: PageHeaderProps) {
  return (
    <div className="sd-page__head">
      <div>
        {breadcrumb}
        {eyebrow && <span className="sd-eyebrow">{eyebrow}</span>}
        <h1 className="sd-page__title">{title}</h1>
        {description && (
          <p
            style={{
              margin: "var(--sd-space-1, .25rem) 0 0",
              maxWidth: "42rem",
              fontSize: "var(--sd-text-small, .8125rem)",
              lineHeight: 1.55,
              color: "var(--sd-text-muted, #3b5265)",
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export interface BreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
}

/** Plain text breadcrumb, e.g. "Assistant / Ava / Prompt" (C-6). No route change. */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: "var(--sd-space-1, .25rem)" }}>
      <ol
        style={{
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          margin: 0,
          padding: 0,
          fontSize: "var(--sd-text-micro, .6875rem)",
          fontWeight: 600,
          letterSpacing: "var(--sd-tracking-eyebrow, .1em)",
          textTransform: "uppercase",
          color: "var(--sd-text-muted, #3b5265)",
        }}
      >
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span aria-hidden="true">/</span>}
            <span>{item.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
