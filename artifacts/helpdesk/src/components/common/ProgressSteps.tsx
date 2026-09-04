/**
 * V5 customer-shell foundation — an ordered checklist with a status chip per
 * row, a progress summary, and one deep link per row. Built for the Setup hub
 * (S-3) and reused by Overview's setup-progress card (D-1); self-contained so
 * it needs no stylesheet this file has no permission to add.
 */

import { Link } from "wouter";
import { Check, ArrowRight } from "lucide-react";
import { StatusChip, type StatusTone } from "@/components/common/StatusChip";

export type ProgressStepStatus = "done" | "next" | "pending" | "blocked";

export interface ProgressStepItem {
  key: string;
  title: string;
  detail: string;
  status: ProgressStepStatus;
  /** Shown only when status === "blocked". */
  blockedReason?: string;
  /** `null` for an in-page step (e.g. the Setup hub's final review) — rendered as an anchor into this same page. */
  href: string | null;
}

const STATUS_LABEL: Record<ProgressStepStatus, string> = {
  done: "Done",
  next: "Next",
  pending: "Pending",
  blocked: "Blocked",
};

const STATUS_TONE: Record<ProgressStepStatus, StatusTone> = {
  done: "done",
  next: "next",
  pending: "pending",
  blocked: "blocked",
};

export interface ProgressStepsProps {
  steps: ProgressStepItem[];
  /** e.g. "3 of 10" — computed by the caller so the wording stays one source of truth. */
  progressLabel: string;
}

export function ProgressSteps({ steps, progressLabel }: ProgressStepsProps) {
  const total = steps.length || 1;
  const done = steps.filter((s) => s.status === "done").length;
  const percent = Math.round((done / total) * 100);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sd-space-3, .75rem)",
          marginBottom: "var(--sd-space-3, .75rem)",
        }}
      >
        <span
          style={{
            fontSize: "var(--sd-text-micro, .6875rem)",
            fontWeight: 600,
            letterSpacing: "var(--sd-tracking-eyebrow, .1em)",
            textTransform: "uppercase",
            color: "var(--sd-text-muted, #3b5265)",
          }}
        >
          {progressLabel}
        </span>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={progressLabel}
          style={{
            flex: "1 1 auto",
            maxWidth: "16rem",
            height: 4,
            borderRadius: 2,
            background: "var(--sd-muted-surface, #f6fbfa)",
            border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              height: "100%",
              width: `${percent}%`,
              background: "var(--sm-mint-500, var(--sd-accent, #27e9b5))",
              transition: "width 240ms cubic-bezier(.2,0,0,1)",
            }}
          />
        </div>
      </div>

      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
          borderRadius: "var(--sd-radius-card, 10px)",
          background: "var(--sd-surface, #fff)",
          overflow: "hidden",
        }}
      >
        {steps.map((step, i) => (
          <li
            key={step.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--sd-space-3, .75rem)",
              padding: "var(--sd-space-3, .75rem) var(--sd-space-4, 1rem)",
              borderTop: i === 0 ? "none" : "1px solid var(--sd-border, rgba(59,82,101,.12))",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: "0 0 auto",
                width: 20,
                height: 20,
                marginTop: 1,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--sd-text-micro, .6875rem)",
                fontWeight: 600,
                background:
                  step.status === "done"
                    ? "var(--sm-mint-500, var(--sd-accent, #27e9b5))"
                    : "var(--sd-muted-surface, #f6fbfa)",
                color:
                  step.status === "done"
                    ? "var(--sm-mint-700, var(--sd-accent-ink, #051824))"
                    : "var(--sd-text-muted, #3b5265)",
                border: step.status === "done" ? "none" : "1px solid var(--sd-border-strong, rgba(59,82,101,.24))",
              }}
            >
              {step.status === "done" ? <Check size={12} /> : i + 1}
            </span>

            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "var(--sd-space-2, .5rem)",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--sd-text-body, .875rem)",
                    fontWeight: 600,
                    color: "var(--sd-text, #051824)",
                  }}
                >
                  {step.title}
                </span>
                <StatusChip label={STATUS_LABEL[step.status]} tone={STATUS_TONE[step.status]} />
              </div>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "var(--sd-text-small, .8125rem)",
                  lineHeight: 1.5,
                  color: "var(--sd-text-muted, #3b5265)",
                }}
              >
                {step.status === "blocked" && step.blockedReason ? step.blockedReason : step.detail}
              </p>
            </div>

            <Link
              href={step.href ?? "#review"}
              style={{
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                minHeight: 32,
                fontSize: "var(--sd-text-small, .8125rem)",
                fontWeight: 600,
                color: "var(--sm-mint-700, var(--sd-text, #051824))",
                textDecoration: "none",
              }}
            >
              {step.status === "done" ? "Review" : "Open"}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
