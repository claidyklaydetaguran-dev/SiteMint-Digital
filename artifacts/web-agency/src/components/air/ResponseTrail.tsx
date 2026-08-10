/**
 * Frontend V2 Phase 4 — the response trail. This page's visual signature.
 * Phase 4.1 — same concept, denser and with a stronger conclusion.
 *
 * It answers one question in one composition: *how does a timely response move
 * through this system, and where does it stop?* Four stages —
 * lead inquiry → acknowledgment → qualification → human handoff — arranged
 * across a single continuous rail, split by who is acting: people on one side,
 * the receptionist on the other, so the direction of the exchange is spatial
 * rather than described.
 *
 * **Phase 4.1 structure.** Phase 4 laid all four stages out as alternating
 * half-width blocks. That was truthful but extremely tall: each stage left the
 * opposite half of the viewport empty, so a reader scanned most of a screen
 * between one stage and the next. Two changes fix it without losing the idea:
 *
 *  1. The first three stages still alternate across the rail, and the pair on
 *     opposite sides is pulled together so consecutive stages read as one
 *     movement rather than separate screens.
 *  2. The **handoff deliberately breaks the pattern**. It leaves the
 *     alternating column and becomes a centred, full-width terminal block
 *     under a filled navy node. Breaking the rhythm at exactly the point a
 *     person takes over is what makes the human conclusion unmistakable, and
 *     it lets the rail end on a node instead of trailing into empty space.
 *
 * What it deliberately is not: a chat mockup, a phone frame, a dashboard
 * screenshot, a stack of speech bubbles, or a card grid. Example messages are
 * set as editorial pull-quotes under a visible "example" label, never as chat
 * UI, and the section states plainly that they are illustrative.
 *
 * Honesty is part of the composition, not a footnote. The boundary panel is
 * attached to the end of the rail as the explicit edge of the shipped path —
 * not a card placed afterwards — and each item carries its real readiness
 * tier in words.
 *
 * Motion and JavaScript: none. Every stage, every example, and every state
 * line is in the DOM on first paint. There is nothing to reveal, nothing to
 * advance, nothing on a timer, and nothing that moves on scroll — so there is
 * no layout shift and no JavaScript-dependent content.
 */

import { MessageSquare, Send, ListChecks, UserCheck } from "lucide-react";
import { READINESS } from "@/components/v2/home/readiness";
import { TRAIL_STAGES, TRAIL_BOUNDARIES } from "./receptionistContent";

/** One icon per stage, in trail order. Kept beside the stage data rather than
    inside it so the content module stays free of presentation imports. */
const STAGE_ICONS = [MessageSquare, Send, ListChecks, UserCheck] as const;

/* The alternating stages and the terminal one. The handoff is always the last
   stage in the approved order, and it is the stage that leaves the columns. */
const ALTERNATING = TRAIL_STAGES.slice(0, -1);
const TERMINAL = TRAIL_STAGES[TRAIL_STAGES.length - 1];
const TerminalIcon = STAGE_ICONS[TRAIL_STAGES.length - 1] ?? UserCheck;

export function ResponseTrail({ id }: { id: string }) {
  return (
    <section className="v2-section air-section" aria-labelledby="trail-heading" id={id}>
      <div className="v2-wrap">
        <div className="v2-head">
          <p className="v2-eyebrow">The response trail</p>
          <h2 id="trail-heading" className="v2-h2">
            One inquiry, from the text to the person who answers it
          </h2>
          <p className="v2-lede">
            This is the path that runs today, over SMS. Follow it down: people
            on the left, the receptionist on the right. It starts with a person
            and it ends with one.
          </p>
          <p className="air-trail__disclaimer">
            The messages below are written examples that show how the exchange
            works. They are not a real customer conversation.
          </p>
        </div>

        <ol className="air-trail">
          {ALTERNATING.map((stage, index) => {
            const Icon = STAGE_ICONS[index] ?? MessageSquare;
            return (
              <li key={stage.id} className="air-trail__stage" data-side={stage.side}>
                <div className="air-trail__marker">
                  <span className="air-trail__node" aria-hidden="true">
                    <Icon className="air-trail__node-icon" />
                  </span>
                  <span className="air-trail__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="air-trail__panel">
                  <p className="air-trail__role">{stage.role}</p>
                  <h3 className="v2-h3 air-trail__title">{stage.title}</h3>

                  <figure className="air-trail__example">
                    <figcaption className="air-trail__example-label">
                      Example message
                    </figcaption>
                    <blockquote className="air-trail__quote">
                      <p>{stage.example}</p>
                    </blockquote>
                  </figure>

                  <p className="v2-body-muted air-trail__body">{stage.body}</p>

                  <p className="air-trail__state">
                    <span className="air-trail__state-label">Then</span>
                    <span className="air-trail__state-text">{stage.state}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* The conclusion. It leaves the alternating columns on purpose: the
            rail ends on this node, and the pattern break is what marks the
            moment the system stops and a person takes over. */}
        <div className="air-handoff">
          <span className="air-handoff__node" aria-hidden="true">
            <TerminalIcon className="air-handoff__node-icon" />
          </span>
          <p className="air-trail__role air-handoff__role">
            <span className="air-handoff__index" aria-hidden="true">
              {String(TRAIL_STAGES.length).padStart(2, "0")}
            </span>
            {TERMINAL.role}
          </p>
          <h3 className="air-handoff__title">{TERMINAL.title}</h3>

          <figure className="air-trail__example air-handoff__example">
            <figcaption className="air-trail__example-label">
              Example message
            </figcaption>
            <blockquote className="air-trail__quote">
              <p>{TERMINAL.example}</p>
            </blockquote>
          </figure>

          <p className="v2-body-muted air-handoff__body">{TERMINAL.body}</p>
          <p className="air-trail__state air-handoff__state">
            <span className="air-trail__state-label">Then</span>
            <span className="air-trail__state-text">{TERMINAL.state}</span>
          </p>
        </div>

        {/* The boundary of the shipped path. Attached to the end of the trail
            rather than boxed beside it: the honest limit of the product is the
            last thing the diagram says, not a separate card. */}
        <div className="air-boundary">
          <h3 className="air-boundary__title">Where the trail stops</h3>
          <p className="v2-body-muted air-boundary__intro">
            Everything above is available now over SMS. These are not part of it
            yet, and this is where each one stands.
          </p>
          <ul className="air-boundary__list">
            {TRAIL_BOUNDARIES.map((item) => (
              <li key={item.name} className="air-boundary__item">
                <div className="air-boundary__head">
                  <h4 className="air-boundary__name">{item.name}</h4>
                  <span className={`v2-tier v2-tier--${item.tier}`}>
                    {READINESS[item.tier].label}
                  </span>
                </div>
                <p className="v2-body-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default ResponseTrail;
