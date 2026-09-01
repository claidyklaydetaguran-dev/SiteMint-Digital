/**
 * Frontend V4 — the AI Receptionist product landing (Signal).
 *
 * Copy is the owner-approved capability-honest set (V4.1): design-intent
 * language only, no production-SMS / autonomous-booking / live-conversation
 * claims until certification. The theater is the labeled staging preview
 * (ReceptionistTheaterV4). AiReceptionistV3 stays as the rollback page.
 */

import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { ReceptionistTheaterV4 } from "@/components/v4/ReceptionistTheaterV4";
import { startHrefV4, startLabelV4 } from "@/components/v4/publicNavV4";

const HELPS = [
  {
    step: "Answer",
    body: "Every caller is greeted your way, immediately — no ring-out, no voicemail black hole.",
  },
  {
    step: "Qualify",
    body: "Your questions, asked naturally: what they need, how soon, how to reach them.",
  },
  {
    step: "Guide",
    body: "Callers reach the next right step — the right information, the right person, the right follow-up.",
  },
  {
    step: "Hand off",
    body: "Anything the receptionist shouldn't handle goes to your team with context, not a mystery voicemail.",
  },
] as const;

const HONEST_ANSWERS = [
  {
    q: "Is this a live demo?",
    a: "Not yet. The theater above is a clearly-labeled simulation of the designed experience. Voice capabilities roll out per client after certification on their account — we don't publish live claims ahead of that.",
  },
  {
    q: "What happens to conversation data?",
    a: "The preview records nothing and retains nothing — no audio, no transcripts (artifact policy: none). Client deployments follow the same discipline: retention is an explicit, owner-controlled decision, never a default.",
  },
  {
    q: "When does a person take over?",
    a: "Whenever your rules say so. Escalation moments — an upset caller, a request outside scope, a VIP — are configuration, and the handoff carries the conversation context with it.",
  },
] as const;

export default function AiReceptionistV4() {
  const reveal = useReveal();

  return (
    <div className="v4-air">
      {/* ── Hero: focused messaging + the staging-preview theater ── */}
      <section className="v4-air__hero" data-tone="ink">
        <div className="v4-container">
          <p className="v4-kicker v4-air__crumb">
            <Link href={ROUTES.home}>Home</Link>
            <span aria-hidden="true"> / </span>
            AI Receptionist
          </p>
          <div className="v4-air__grid">
            <div className="v4-air__copy">
              <h1 className="v4-air__title">
                Meet the receptionist designed to help every caller reach the
                next right step.
              </h1>
              <p className="v4-air__sub">
                Answering, qualifying, and guiding callers by your rules —
                designed to work hand-in-hand with your website, your calendar,
                and your team.
              </p>
              <div className="v4-air__ctas">
                <Link href={startHrefV4} className="v4-btn v4-btn--primary">
                  {startLabelV4}
                </Link>
                <Link
                  href={ROUTES.aiReceptionistSignup}
                  className="v4-btn v4-btn--outline"
                >
                  Create an account
                </Link>
              </div>
              <p className="v4-air__note">
                Voice capabilities roll out per client after certification on
                their account. What you see here is the designed experience,
                not a live production claim.
              </p>
            </div>
            <ReceptionistTheaterV4 />
          </div>
        </div>
      </section>

      {/* ── 01 · How it helps ── */}
      <section className="v4-section" data-tone="porcelain">
        <div className="v4-container">
          <div className="v4-chapter-head" ref={reveal} data-v4-reveal>
            <span className="v4-kicker">01 — How it helps</span>
            <span className="v4-chapter-rule" aria-hidden="true" />
          </div>
          <h2 className="v4-h2" ref={reveal} data-v4-reveal>
            Answer. Qualify. Guide. Hand off.
          </h2>
          <p className="v4-lede" ref={reveal} data-v4-reveal>
            Every conversation follows your rules: your greeting, your
            questions, your boundaries.
          </p>
          <ol className="v4-air__steps" ref={reveal} data-v4-reveal>
            {HELPS.map((item, i) => (
              <li className="v4-air__step" key={item.step}>
                <span className="v4-air__step-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="v4-air__step-title">{item.step}</h3>
                <p className="v4-air__step-body">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 02 · Straight answers ── */}
      <section className="v4-section" data-tone="white">
        <div className="v4-container">
          <div className="v4-chapter-head" ref={reveal} data-v4-reveal>
            <span className="v4-kicker">02 — Straight answers</span>
            <span className="v4-chapter-rule" aria-hidden="true" />
          </div>
          <h2 className="v4-h2" ref={reveal} data-v4-reveal>
            What it is today — said plainly.
          </h2>
          <div className="v4-air__answers" ref={reveal} data-v4-reveal>
            {HONEST_ANSWERS.map((item) => (
              <div className="v4-air__answer" key={item.q}>
                <h3 className="v4-air__answer-q">{item.q}</h3>
                <p className="v4-air__answer-a">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 03 · Next step ── */}
      <section className="v4-section v4-cta-band" data-tone="ink">
        <div className="v4-container">
          <span className="v4-kicker">03 — Next step</span>
          <h2 className="v4-h2">
            Want your callers to reach the next right step, every time?
          </h2>
          <div className="v4-cta-band__actions">
            <Link href={startHrefV4} className="v4-btn v4-btn--primary">
              {startLabelV4}
            </Link>
            <Link href={ROUTES.process} className="v4-btn v4-btn--outline">
              See our process
            </Link>
          </div>
        </div>
        <span className="v4-signal-rule v4-cta-band__thread" aria-hidden="true" />
      </section>
    </div>
  );
}
