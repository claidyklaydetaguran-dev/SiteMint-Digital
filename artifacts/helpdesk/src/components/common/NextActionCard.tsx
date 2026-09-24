/**
 * The single "one next-best-action" surface used by Overview and the Setup
 * hub. Deliberately singular: callers pass exactly one action, never a list,
 * so the dashboard cannot regress into a wall of competing buttons.
 *
 * Styled by the SiteMint Workspace system (`styles/workspace.css`, `ws-next`)
 * rather than inline colours, so it reads as part of the same product in
 * light and dark appearance alike.
 */

import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export interface NextActionCardProps {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  /** Small label above the title. Defaults to "Next step". */
  eyebrow?: string;
}

export function NextActionCard({ title, detail, actionLabel, href, eyebrow = "Next step" }: NextActionCardProps) {
  return (
    <section className="ws-next" aria-labelledby="sd-next-action-title">
      <div className="ws-next__body">
        <span className="ws-next__eyebrow">{eyebrow}</span>
        <h2 id="sd-next-action-title" className="ws-next__title">
          {title}
        </h2>
        {detail && <p className="ws-next__detail">{detail}</p>}
      </div>
      <Link href={href} className="ws-button" data-variant="primary">
        {actionLabel}
        <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
