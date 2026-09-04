/**
 * V5 customer-shell foundation — the Setup hub (S-3).
 *
 * Ten steps in the approved order, each with a title, a one-line purpose, a
 * derived status chip and a deep link; one progress bar; one next-action
 * button at the top (never a list of actions); a final review step that
 * lists what is done and what is missing, with an always-disabled "Activate
 * receptionist" button — activation happens with SiteMint during
 * private-beta onboarding, never automatically from this page.
 *
 * Status is the combination the brief specifies: the saved onboarding state
 * (`GET/PUT /api/receptionist/onboarding`) plus real-data inference for the
 * four steps that have an independent signal (business, availability,
 * calendar, phone number). Newly-inferred "done" steps are written back with
 * `PUT` once per data change, not on every render — see the effect below.
 */

import { useEffect, useRef } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { NextActionCard } from "@/components/common/NextActionCard";
import { ProgressSteps } from "@/components/common/ProgressSteps";
import { useSetupData, useSyncInferredSteps } from "@/pages/setup/setupApi";
import {
  ACTIVATE_DISABLED_REASON,
  buildDisplaySteps,
  buildNextAction,
  buildReviewSummary,
  deriveStepStatuses,
  isSetupComplete,
  pageCopy,
  progressLabel,
} from "@/pages/setup/setupContract";
import "@/styles/v2-dashboard.css";

function SetupSkeleton() {
  return (
    <div className="sd-page" aria-busy="true">
      <p className="sd-sr" role="status">
        Loading your setup progress
      </p>
      <div className="sd-skel sd-skel--title" />
      <div className="sd-skel sd-skel--status" />
      <div className="sd-skel sd-skel--list" />
    </div>
  );
}

export default function Setup() {
  const data = useSetupData();
  const sync = useSyncInferredSteps();
  const syncedKey = useRef<string | null>(null);

  const statuses = deriveStepStatuses(data.saved, data.signals);
  const display = buildDisplaySteps(statuses);
  const next = buildNextAction(display);
  const review = buildReviewSummary(display);
  const complete = isSetupComplete(statuses);
  const page = pageCopy();

  // Write back newly-inferred "done" steps once the data this render is
  // based on has actually changed — the ref key is the signal snapshot, so a
  // re-render with the same signals never issues a second PUT.
  useEffect(() => {
    if (!data.ready) return;
    const key = JSON.stringify(data.signals);
    if (syncedKey.current === key) return;
    syncedKey.current = key;
    void sync(data.saved, data.signals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.ready, JSON.stringify(data.signals)]);

  if (data.loading) return <SetupSkeleton />;

  return (
    <div className="sd-page sd-enter">
      <PageHeader eyebrow={page.eyebrow} title={page.title} description={page.detail} />

      <NextActionCard
        title={next.title}
        detail={next.detail}
        actionLabel={next.actionLabel}
        href={next.href}
      />

      <section className="sd-section" aria-labelledby="setup-steps-title" style={{ marginTop: "var(--sd-space-6, 1.5rem)" }}>
        <div className="sd-section__head">
          <h2 className="sd-h2" id="setup-steps-title">
            Setup steps
          </h2>
        </div>
        <ProgressSteps steps={display} progressLabel={progressLabel(statuses)} />
      </section>

      <section
        id="review"
        className="sd-status"
        data-state={complete ? "answering" : "incomplete"}
        aria-labelledby="setup-review-title"
        style={{ marginTop: "var(--sd-space-6, 1.5rem)" }}
      >
        <div className="sd-status__head">
          <span className="sd-status__dot" aria-hidden="true" />
          <div className="sd-status__body">
            <h2 className="sd-status__title" id="setup-review-title">
              Final review and activation
            </h2>
            <p className="sd-status__detail">
              {complete
                ? "Every step is complete. Review below, then request activation."
                : `${review.missingTitles.length} step${review.missingTitles.length === 1 ? "" : "s"} still need${review.missingTitles.length === 1 ? "s" : ""} attention.`}
            </p>
          </div>
        </div>

        <div style={{ padding: "0 var(--sd-space-5, 1.25rem) var(--sd-space-4, 1rem)" }}>
          {review.doneTitles.length > 0 && (
            <p style={{ margin: "0 0 4px", fontSize: "var(--sd-text-small, .8125rem)", color: "var(--sd-text, #051824)" }}>
              <strong>Done:</strong> {review.doneTitles.join(", ")}
            </p>
          )}
          {review.missingTitles.length > 0 && (
            <p style={{ margin: 0, fontSize: "var(--sd-text-small, .8125rem)", color: "var(--sd-text-muted, #3b5265)" }}>
              <strong>Missing:</strong> {review.missingTitles.join(", ")}
            </p>
          )}
        </div>

        <div className="sd-status__foot">
          <button
            type="button"
            className="sd-step__action"
            disabled
            aria-disabled="true"
            title={ACTIVATE_DISABLED_REASON}
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            Activate receptionist
          </button>
          <p style={{ margin: "8px 0 0", fontSize: "var(--sd-text-small, .8125rem)", color: "var(--sd-text-muted, #3b5265)" }}>
            {ACTIVATE_DISABLED_REASON}
          </p>
        </div>
      </section>
    </div>
  );
}
