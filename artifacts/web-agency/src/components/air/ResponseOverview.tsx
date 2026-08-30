/**
 * Frontend V2 Phase 4.1 — the hero's compact response overview.
 *
 * The Phase 4 hero was a left-aligned column in an otherwise empty container.
 * This fills the right side with the one thing a visitor most needs above the
 * fold: what the product actually does, end to end, in four beats —
 * inquiry → acknowledgment → qualification → human handoff.
 *
 * It is a **summary, not a second copy of the response trail**. There are no
 * example messages here and no per-stage detail; the labels and one short
 * clause each are all it carries. The full trail below is where the exchange
 * is actually shown. The two are deliberately built from the same vocabulary —
 * the same rail, the same node shapes, the same filled navy terminal node — so
 * the overview reads as the trail's table of contents rather than a different
 * diagram.
 *
 * Product truth is structural, not decorative:
 *  - the shipped capability is named and tiered at the top, so "SMS —
 *    available now" is the first thing the composition asserts;
 *  - every step shown is part of that shipped SMS path;
 *  - voice and CRM are pushed to a closing line, in smaller muted type, each
 *    carrying its own tier word from the shared readiness source.
 *
 * Availability never depends on colour: each tier is spelled out in words.
 *
 * No JavaScript, no state, no motion, no autoplay. Everything is in the DOM on
 * first paint, so there is nothing to reveal and nothing to shift.
 */

import { READINESS } from "@/components/v2/home/readiness";

interface OverviewStep {
  label: string;
  body: string;
  /** The final step is a person, and is marked as the trail's conclusion. */
  terminal?: boolean;
}

const STEPS: OverviewStep[] = [
  { label: "Inquiry", body: "Someone texts the number your receptionist answers on." },
  { label: "Acknowledgment", body: "It replies, rather than leaving the message unread." },
  { label: "Qualification", body: "It asks the questions you chose, then sorts the result." },
  {
    label: "Human handoff",
    body: "Your team gets the summary. A person decides what happens next.",
    terminal: true,
  },
];

export function ResponseOverview() {
  return (
    <aside className="air-overview" aria-labelledby="air-overview-heading">
      <div className="air-overview__head">
        <h2 id="air-overview-heading" className="air-overview__title">
          The SMS receptionist, end to end
        </h2>
        <span className="v2-tier v2-tier--available">
          {READINESS.available.label}
        </span>
      </div>

      <ol className="air-overview__list">
        {STEPS.map((step, index) => (
          <li
            key={step.label}
            className={`air-overview__step${
              step.terminal ? " air-overview__step--terminal" : ""
            }`}
          >
            <span className="air-overview__node" aria-hidden="true" />
            <span className="air-overview__index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="air-overview__text">
              <span className="air-overview__label">{step.label}</span>
              <span className="air-overview__body">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* What is not in the path above. Smaller, muted, and tier-labelled, so
          it can never be mistaken for part of the shipped journey. */}
      <p className="air-overview__note">
        <span className="air-overview__note-item">
          Voice — {READINESS["in-development"].label.toLowerCase()}
        </span>
        <span className="air-overview__note-item">
          Connected CRM and automated follow-up —{" "}
          {READINESS.planned.label.toLowerCase()}
        </span>
      </p>
    </aside>
  );
}

export default ResponseOverview;
