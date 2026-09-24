/**
 * The workspace page head: an eyebrow, a title, a one-line purpose statement,
 * an optional breadcrumb (return path) and an optional primary-action slot.
 * Reuses the `sd-page__head` / `sd-page__title` / `sd-eyebrow` classes and is
 * styled by the SiteMint Workspace system (`styles/workspace.css`), so every
 * page inside `DashboardShell` gets the same header rhythm.
 */

import type { ReactNode } from "react";
import { Link } from "wouter";

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
        {description && <p className="ws-page-lede">{description}</p>}
      </div>
      {action && <div className="ws-page-actions">{action}</div>}
    </div>
  );
}

export interface BreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
}

/** Breadcrumb, e.g. "Assistant / Ava / Prompt" (C-6). Items with an href are return links. */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="ws-crumbs">
      <ol>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
