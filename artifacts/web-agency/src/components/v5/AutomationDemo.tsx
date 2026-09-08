/**
 * SiteMint V5 — the AI & Automation homepage demonstration
 * (owner correction, 2026-09-09: the previous route-line-with-nodes was
 * "incomplete, too subtle, and visually empty").
 *
 * "An inquiry comes in. SiteMint keeps it moving." — three visible stages
 * a business owner can read without any technical vocabulary:
 *
 *   1 · Inquiry received      — website form, message, or call
 *   2 · Information organized — the details are kept together
 *   3 · Follow-up ready       — task assigned, reply drafted, reminder set
 *
 * Behaviour:
 * - A restrained automatic sequence advances the active stage; a visible
 *   signal line fills between stages.
 * - Clicking (or keyboard-activating) a stage selects it and stops the
 *   automatic sequence — the visitor is now in control.
 * - Reduced motion (system preference or the site's Reduce-animation
 *   switch) renders every stage expanded, no timer, no animation.
 * - All text is real HTML text. The sample inquiry is clearly labelled
 *   as an illustration; no real customer data, no fake live status.
 * - Mobile stacks vertically (CSS in v5-home.css, `.sm-autodemo`).
 */

import { useEffect, useRef, useState } from "react";
import { motionOff } from "@/components/v5/motionPref";

interface DemoStage {
  no: string;
  title: string;
  plain: string;
  sample: string[];
}

const STAGES: DemoStage[] = [
  {
    no: "1",
    title: "Inquiry received",
    plain: "A visitor fills out your form, sends a message, or calls.",
    sample: [
      "New inquiry — from your website",
      "“Hi, do you install water heaters? — Maria”",
    ],
  },
  {
    no: "2",
    title: "Information organized",
    plain:
      "The important details stay together — who they are, what they need, how to reach them.",
    sample: [
      "Maria S. · Water heater installation",
      "(555) 014-2288 · saved with her request",
    ],
  },
  {
    no: "3",
    title: "Follow-up ready",
    plain:
      "A task is assigned, a reply is drafted, and a reminder is scheduled — important decisions stay with your team.",
    sample: [
      "Task for your team: call Maria today",
      "Reply drafted · reminder set for 3:00 PM",
    ],
  },
];

const ADVANCE_MS = 3600;

export function AutomationDemo() {
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [handsOn, setHandsOn] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches || motionOff());
  }, []);

  // Automatic, restrained sequence — stops the moment the visitor takes over.
  useEffect(() => {
    if (reduced || handsOn) return undefined;
    timer.current = window.setInterval(() => {
      setActive((s) => (s + 1) % STAGES.length);
    }, ADVANCE_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [reduced, handsOn]);

  return (
    <div
      className="sm-autodemo"
      data-stage={active}
      data-static={reduced || undefined}
    >
      <p className="sm-autodemo__intro">
        An inquiry comes in. SiteMint keeps it moving.
      </p>
      <div className="sm-autodemo__stages">
        <span className="sm-autodemo__line" aria-hidden="true">
          <span className="sm-autodemo__line-fill" />
        </span>
        {STAGES.map((stage, i) => {
          const isOpen = reduced || active === i;
          return (
            <button
              key={stage.no}
              type="button"
              className="sm-autodemo__stage"
              data-active={(reduced || active === i) || undefined}
              aria-expanded={isOpen}
              onClick={() => {
                setHandsOn(true);
                setActive(i);
              }}
            >
              <span className="sm-autodemo__dot" aria-hidden="true">
                {stage.no}
              </span>
              <span className="sm-autodemo__title">{stage.title}</span>
              <span className="sm-autodemo__plain">{stage.plain}</span>
              <span className="sm-autodemo__card" hidden={!isOpen}>
                {stage.sample.map((line) => (
                  <span className="sm-autodemo__card-line" key={line}>
                    {line}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="sm-autodemo__note">
        Sample inquiry, for illustration — no real customer data.
      </p>
    </div>
  );
}

export default AutomationDemo;
