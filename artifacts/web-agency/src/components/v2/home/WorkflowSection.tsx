/**
 * Frontend V2 Phase 3 — section 6, the interactive system workflow.
 *
 * This is the **one** intentional navy feature section the homepage is allowed
 * (INFORMATION-ARCHITECTURE.md §2); the footer is the only other navy surface.
 *
 * Motion contract (MOTION-AND-INTERACTION.md; owner requirements):
 * - The diagram is fully readable before any interaction. Every step's summary
 *   is always in the DOM; selecting a step reveals its detail panel.
 * - It changes **only** on deliberate user interaction — click, or Arrow keys
 *   within the tablist — and then stays where the user left it. Nothing
 *   advances on a timer, on scroll, or on intersection.
 * - No infinite motion, no autoplay, no scroll-jacking. The only transition is
 *   a short opacity/position settle on the detail panel, removed entirely under
 *   `prefers-reduced-motion`.
 *
 * The pattern is a real ARIA tablist with roving tabindex, matching the
 * keyboard behaviour the existing ProcessSection already ships.
 */

import { useRef, useState } from "react";
import { Globe, Inbox, MessageSquare, Database, UserCheck } from "lucide-react";
import { READINESS, type ReadinessTier } from "./readiness";

interface Step {
  id: string;
  label: string;
  summary: string;
  detail: string;
  icon: typeof Globe;
  tier: ReadinessTier;
}

const steps: Step[] = [
  {
    id: "arrive",
    label: "Someone arrives",
    summary: "A visitor lands on the website or app.",
    detail:
      "The site is the front door. It is built to make the next step obvious, so a visitor who is interested has an easy way to say so instead of leaving.",
    icon: Globe,
    tier: "available",
  },
  {
    id: "inquire",
    label: "They get in touch",
    summary: "The visitor sends an inquiry.",
    detail:
      "A form, a message, or a text. This is the moment most businesses lose: the inquiry arrives somewhere nobody is watching, and the answer comes too late to matter.",
    icon: Inbox,
    tier: "available",
  },
  {
    id: "respond",
    label: "The receptionist replies",
    summary: "SMS Receptionist answers and asks what the business needs to know.",
    detail:
      "The AI Receptionist replies over SMS and works through the questions the business decided matter — what the job is, where it is, and how to reach them. The conversation is kept in one place rather than scattered across inboxes.",
    icon: MessageSquare,
    tier: "available",
  },
  {
    id: "organise",
    label: "It becomes a record",
    summary: "The conversation is organised into the CRM.",
    detail:
      "The direction of the product is that a finished conversation lands in the CRM as a record with its history attached, so nothing depends on someone remembering to write it down. This connection is planned, not shipped.",
    icon: Database,
    tier: "planned",
  },
  {
    id: "follow-up",
    label: "A person takes over",
    summary: "Follow-up happens with the full context already gathered.",
    detail:
      "A human picks up the conversation already knowing who the customer is and what they asked for. Automating the reminder to do so is planned; today the handoff is a person's decision.",
    icon: UserCheck,
    tier: "planned",
  },
];

export function WorkflowSection() {
  const [activeId, setActiveId] = useState(steps[0].id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = steps.findIndex((s) => s.id === activeId);
  const active = steps[activeIndex] ?? steps[0];

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % steps.length;
    if (event.key === "ArrowLeft") next = (index - 1 + steps.length) % steps.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = steps.length - 1;
    setActiveId(steps[next].id);
    tabRefs.current[next]?.focus();
  }

  const ActiveIcon = active.icon;

  return (
    <section className="v2-section v2-section--feature" aria-labelledby="workflow-heading">
      <div className="v2-wrap">
        <p className="v2-eyebrow v2-eyebrow--on-dark">The mechanism</p>
        <h2 id="workflow-heading" className="v2-h2 v2-h2--on-dark">
          Follow one inquiry all the way through
        </h2>
        <p className="v2-lede v2-lede--on-dark">
          Select a step to see what happens at that point. Nothing moves on its
          own — this stays wherever you leave it.
        </p>

        <div
          className="v2-flow__tabs"
          role="tablist"
          aria-label="Stages of an inquiry"
        >
          {steps.map((step, index) => {
            const selected = step.id === activeId;
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`flow-tab-${step.id}`}
                aria-selected={selected}
                aria-controls={`flow-panel-${step.id}`}
                tabIndex={selected ? 0 : -1}
                className="v2-flow__tab"
                onClick={() => setActiveId(step.id)}
                onKeyDown={(e) => onKeyDown(e, index)}
              >
                <span className="v2-flow__step" aria-hidden="true">
                  {index + 1}
                </span>
                <Icon aria-hidden="true" className="v2-flow__tab-icon" />
                <span className="v2-flow__tab-label">{step.label}</span>
                <span className="v2-flow__tab-summary">{step.summary}</span>
                {step.tier !== "available" && (
                  <span className={`v2-tier v2-tier--${step.tier}`}>
                    {READINESS[step.tier].label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          className="v2-flow__panel"
          role="tabpanel"
          id={`flow-panel-${active.id}`}
          aria-labelledby={`flow-tab-${active.id}`}
          tabIndex={0}
          key={active.id}
        >
          <ActiveIcon aria-hidden="true" className="v2-flow__panel-icon" />
          <div>
            <h3 className="v2-flow__panel-title">{active.label}</h3>
            <p className="v2-flow__panel-body">{active.detail}</p>
            {active.tier !== "available" && (
              <p className="v2-flow__panel-note">{READINESS[active.tier].note}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default WorkflowSection;
