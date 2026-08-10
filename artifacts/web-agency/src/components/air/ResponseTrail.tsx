/**
 * Frontend V2 Phase 4 — the response trail. This page's visual signature.
 *
 * It answers one question in one composition: *how does a timely response move
 * through this system, and where does it stop?* Four stages —
 * lead inquiry → acknowledgment → qualification → human handoff — arranged
 * across a single continuous rail, split by who is acting: people on one side,
 * the receptionist on the other, so the direction of the exchange is spatial
 * rather than described. The trail therefore opens and closes on the human
 * side, which is the argument the section is making.
 *
 * What it deliberately is not: a chat mockup, a phone frame, a dashboard
 * screenshot, a stack of speech bubbles, or a card grid. Example messages are
 * set as editorial pull-quotes under a visible "example" label, never as chat
 * UI, and the section states plainly that they are illustrative.
 *
 * Honesty is part of the composition, not a footnote. The trail ends on an
 * explicit human handoff, and the boundary panel directly beneath it names what
 * the trail does **not** do, each carrying its real readiness tier. A future
 * capability can never read as available as the shipped path, because the
 * shipped path is the rail and the future work is outside it.
 *
 * Motion and JavaScript: none. Every stage, every example, and every state line
 * is in the DOM on first paint. There is nothing to reveal, nothing to advance,
 * nothing on a timer, and nothing that moves on scroll — so there is no layout
 * shift and no JavaScript-dependent content. The only transitions in the
 * stylesheet are on focus and hover of real controls.
 */

import { MessageSquare, Send, ListChecks, UserCheck } from "lucide-react";
import { READINESS } from "@/components/v2/home/readiness";
import { TRAIL_STAGES, TRAIL_BOUNDARIES } from "./receptionistContent";

/** One icon per stage, in trail order. Kept beside the stage data rather than
    inside it so the content module stays free of presentation imports. */
const STAGE_ICONS = [MessageSquare, Send, ListChecks, UserCheck] as const;

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
          {TRAIL_STAGES.map((stage, index) => {
            const Icon = STAGE_ICONS[index] ?? MessageSquare;
            const last = index === TRAIL_STAGES.length - 1;
            return (
              <li
                key={stage.id}
                className={`air-trail__stage${last ? " air-trail__stage--handoff" : ""}`}
                data-side={stage.side}
              >
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

        {/* The boundary of the shipped path. This sits inside the signature on
            purpose: the honest limit of the product is part of the diagram, not
            a disclaimer printed underneath it. */}
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
