/**
 * Setup — four steps, read from the server's readiness answer.
 *
 *   1. Business information
 *   2. Greeting and voice
 *   3. What it can do (messages always; booking and transfer optional)
 *   4. Test and activate
 *
 * Every status comes from `GET /api/receptionist/readiness`, which Overview
 * reads too. Nothing here stores a tick: a calendar whose access is withdrawn
 * stops reading as done on the next visit. A fact the server could not read
 * says "Not checked".
 */

import { Link } from "wouter";
import { CheckCircle2, Circle, AlertTriangle, HelpCircle, MinusCircle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { NextActionCard } from "@/components/common/NextActionCard";
import { InlineError } from "@/components/common/InlineError";
import {
  CHECK_STATE_LABEL,
  STEP_STATE_LABEL,
  useReadiness,
  type ReadinessCheck,
  type ReadinessStep,
} from "@/lib/readinessApi";
// The next step names the real action ("Publish your receptionist"), the same
// helper the overview uses, rather than the check label ("Published").
import { readinessNextStep } from "@/pages/overview/overviewContract";
import "@/styles/v2-dashboard.css";

/** Details like "Saved." only repeat the state; they are shown for anything not yet done. */
const ROUTINE_DETAIL = /^(Saved|Created|Chosen).$/;

const CHECK_ICON = {
  done: CheckCircle2,
  todo: Circle,
  attention: AlertTriangle,
  not_checked: HelpCircle,
  off: MinusCircle,
} as const;

function CheckRow({ check }: { check: ReadinessCheck }) {
  const Icon = CHECK_ICON[check.state];
  return (
    <li className="setup4-check" data-state={check.state}>
      <Icon className="setup4-check__icon" aria-hidden="true" />
      <div className="setup4-check__body">
        <div className="setup4-check__head">
          <span className="setup4-check__label">{check.label}</span>
          <span className="setup4-check__state">{CHECK_STATE_LABEL[check.state]}</span>
        </div>
        {!(check.state === "done" && ROUTINE_DETAIL.test(check.detail)) && <p className="setup4-check__detail">{check.detail}</p>}
      </div>
      {check.fixPath && check.state !== "done" && (
        <Link href={check.fixPath} className="setup4-check__action">
          {check.state === "off" ? "Turn on" : check.state === "attention" ? "Fix" : "Open"}
          <span className="sd-sr"> {check.label}</span>
        </Link>
      )}
    </li>
  );
}

function StepCard({ step }: { step: ReadinessStep }) {
  const headingId = `setup-step-${step.key}`;
  const doneChecks = step.checks.filter((c) => c.state === "done").length;
  const offChecks = step.checks.filter((c) => c.state === "off").length;
  const summary =
    offChecks > 0
      ? `${doneChecks} on, ${offChecks} optional ${offChecks === 1 ? "item" : "items"} off`
      : `${doneChecks} of ${step.checks.length} items done`;
  const checks = (
    <ul className="setup4-checks">
      {step.checks.map((c) => (
        <CheckRow key={c.key} check={c} />
      ))}
    </ul>
  );
  return (
    <section className="setup4-step" data-state={step.state} aria-labelledby={headingId}>
      <header className="setup4-step__head">
        <span className="setup4-step__number" aria-hidden="true">
          {step.number}
        </span>
        <div className="setup4-step__titles">
          <h2 className="setup4-step__title" id={headingId}>
            <span className="sd-sr">Step {step.number} of 4: </span>
            {step.title}
          </h2>
          <p className="setup4-step__summary">{step.summary}</p>
        </div>
        <span className="setup4-step__state">{STEP_STATE_LABEL[step.state]}</span>
      </header>
      {step.state === "done" ? (
        <details className="ws-step-details">
          <summary>
            {summary} — show details
          </summary>
          {checks}
        </details>
      ) : (
        checks
      )}
    </section>
  );
}

export default function Setup() {
  const readiness = useReadiness();

  if (readiness.isLoading) {
    return (
      <div className="sd-page" aria-busy="true">
        <p className="sd-sr" role="status">Loading your setup</p>
        <div className="sd-skel sd-skel--title" />
        <div className="sd-skel sd-skel--list" />
      </div>
    );
  }

  if (readiness.isError || !readiness.data) {
    return (
      <div className="sd-page sd-enter">
        <PageHeader eyebrow="Setup" title="Set up your receptionist" description="Four steps from sign-up to answering real calls." />
        <InlineError
          title="Setup couldn't be checked"
          description="SiteMint couldn't read where your setup stands. Nothing has changed. Try again."
          onRetry={() => readiness.refetch()}
        />
      </div>
    );
  }

  const r = readiness.data;
  const done = r.steps.filter((s) => s.state === "done").length;
  const next = readinessNextStep(r);

  return (
    <div className="sd-page sd-enter">
      <PageHeader eyebrow="Setup" title="Set up your receptionist" description="Four steps from sign-up to answering real calls." />

      <div className="setup4-overall" data-state={r.state} role="status" aria-live="polite">
        <span className="setup4-overall__label">{r.label}</span>
        <span className="setup4-overall__detail">{r.detail}</span>
        <span className="setup4-overall__progress">
          {done} of {r.steps.length} steps complete
        </span>
        <span className="ws-progress-inline" aria-hidden="true">
          {r.steps.map((step) => (
            <span key={step.key} data-state={step.state} />
          ))}
        </span>
      </div>

      {next && <NextActionCard title={next.title} detail={next.detail} actionLabel={next.actionLabel} href={next.href} />}

      <div className="setup4-steps">
        {r.steps.map((step) => (
          <StepCard key={step.key} step={step} />
        ))}
      </div>

      <p className="setup4-footnote">
        Checked {new Date(r.checkedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.{" "}
        <button type="button" className="sd-link" onClick={() => readiness.refetch()} disabled={readiness.isFetching}>
          {readiness.isFetching ? "Checking…" : "Check again"}
        </button>
      </p>
    </div>
  );
}
