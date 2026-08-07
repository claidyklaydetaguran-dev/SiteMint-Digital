/**
 * Frontend V2 Phase 3 — the hero product-system composition.
 *
 * A **real HTML/CSS composition**, not an image: an ordered list of the five
 * stages a single inquiry passes through, with labelled connectors between
 * them. It is semantic markup styled with CSS, so it reads correctly with
 * styles off, with JavaScript off, and to a screen reader.
 *
 * Explicitly not used (CONTENT-SPECIFICATION.md §2): fake laptop/tablet/phone
 * imagery, AI-generated interface screenshots, any generated image, Magnific,
 * video, robots, headset photography, WebGL, 3D, neon circuitry, unreadable
 * interface text, and continuously floating cards. Nothing here animates after
 * the single hero entrance.
 *
 * The stage labels describe SiteMint's own connected model. The two stages that
 * are not generally available carry their readiness tier inline, next to the
 * stage — never in a footnote — so the composition cannot imply a shipped
 * capability. See `readiness.ts`.
 */

import { Globe, Inbox, Database, MessageSquare, UserCheck } from "lucide-react";
import { READINESS, type ReadinessTier } from "./readiness";

interface Stage {
  label: string;
  detail: string;
  icon: typeof Globe;
  tier: ReadinessTier;
}

const stages: Stage[] = [
  {
    label: "Website or app",
    detail: "The surface a potential customer actually lands on.",
    icon: Globe,
    tier: "available",
  },
  {
    label: "Lead inquiry",
    detail: "Someone asks a question, requests a quote, or gets in touch.",
    icon: Inbox,
    tier: "available",
  },
  {
    label: "CRM organization",
    detail: "The inquiry becomes a record instead of a lost message.",
    icon: Database,
    tier: "planned",
  },
  {
    label: "SMS response",
    detail: "The receptionist replies and asks what the business needs to know.",
    icon: MessageSquare,
    tier: "available",
  },
  {
    label: "Human follow-up",
    detail: "A person picks it up with the full conversation already in hand.",
    icon: UserCheck,
    tier: "planned",
  },
];

export function SystemComposition() {
  return (
    <figure className="v2-sys">
      <figcaption className="v2-sys__caption">
        How one inquiry moves through a SiteMint system
      </figcaption>

      <ol className="v2-sys__list">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const readiness = READINESS[stage.tier];
          return (
            <li key={stage.label} className="v2-sys__stage">
              <div className="v2-sys__node">
                <span className="v2-sys__index" aria-hidden="true">
                  {index + 1}
                </span>
                <Icon aria-hidden="true" className="v2-sys__icon" />
                <p className="v2-sys__label">{stage.label}</p>
                <p className="v2-sys__detail">{stage.detail}</p>
                {stage.tier !== "available" && (
                  <p className={`v2-tier v2-tier--${stage.tier}`}>{readiness.label}</p>
                )}
              </div>
              {index < stages.length - 1 && (
                <span className="v2-sys__edge" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

export default SystemComposition;
