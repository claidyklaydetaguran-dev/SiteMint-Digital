/**
 * Frontend V2 Phase 3 — the hero product-system composition.
 * Phase 3.1 — refined presentation. Content and semantics are unchanged.
 *
 * A **real HTML/CSS composition**, not an image: an ordered list of the five
 * stages a single inquiry passes through, with labelled connectors between
 * them. It is semantic markup styled with CSS, so it reads correctly with
 * styles off, with JavaScript off, and to a screen reader.
 *
 * Phase 3.1 presentation notes. The composition previously read as a plain
 * form: one white card holding five identical boxes. It is now a journey rail —
 * the stages sit on a shared spine, each stage is marked live or planned so the
 * shipped path through the system is the one that reads first, and the spine
 * segment between two stages inherits the state of the stage it leads into. The
 * outer card is gone, so the rail composes with the headline instead of sitting
 * beside it as a separate panel.
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
 * capability. The legend states the same two states in words, so the visual
 * distinction is never the only signal. See `readiness.ts`.
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
      <div className="v2-sys__head">
        <figcaption className="v2-sys__caption">
          How one inquiry moves through a SiteMint system
        </figcaption>
        {/* The legend states both stage states in words: the rail's visual
            distinction is never the only signal. */}
        <ul className="v2-sys__legend">
          <li className="v2-sys__legend-item v2-sys__legend-item--available">
            {READINESS.available.label}
          </li>
          <li className="v2-sys__legend-item v2-sys__legend-item--planned">
            {READINESS.planned.label}
          </li>
        </ul>
      </div>

      <ol className="v2-sys__list">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const readiness = READINESS[stage.tier];
          return (
            <li
              key={stage.label}
              className={`v2-sys__stage v2-sys__stage--${stage.tier}`}
            >
              <div className="v2-sys__node">
                <span className="v2-sys__index" aria-hidden="true">
                  {index + 1}
                </span>
                <p className="v2-sys__label">
                  <Icon aria-hidden="true" className="v2-sys__icon" />
                  <span>{stage.label}</span>
                </p>
                {stage.tier !== "available" && (
                  <p className={`v2-tier v2-tier--${stage.tier}`}>{readiness.label}</p>
                )}
                <p className="v2-sys__detail">{stage.detail}</p>
              </div>
              {index < stages.length - 1 && (
                /* The connector carries the state of the stage it leads into,
                   so the shipped path and the planned path are told apart by
                   the rail itself and not only by the pill. */
                <span
                  className={`v2-sys__edge v2-sys__edge--${stages[index + 1].tier}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

export default SystemComposition;
