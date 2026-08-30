import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, MessageSquareText, User } from "lucide-react";
import { useSelectedGoal } from "./PlatformPreviewGoalContext";
import { receptionistDemoScenarios, defaultReceptionistDemoScenarioId, type ReceptionistDemoScenario } from "./receptionistDemoScenarios";

const SCENARIO_IDS = Object.keys(receptionistDemoScenarios) as ReceptionistDemoScenario["id"][];

/**
 * Clearly synthetic demonstration (Checkpoint 2A.2 Part 3) — not a live
 * call, no microphone, no provider connection, no real customer record.
 * Frontend Epic 1 extends the original static captured-fields card with a
 * required interactive sequence: pick a scenario (overrides the shared
 * goal-driven default), watch a simulated "answering" waveform, then a
 * progressively revealed transcript, a captured-lead summary, and a
 * routing/next-action result. The "Interactive Demo — No Live Call" label
 * stays visible through every state. Sequencing uses plain timers, skipped
 * entirely under prefers-reduced-motion (the end state renders immediately).
 */
export function AiReceptionistDemo() {
  const { selectedGoal } = useSelectedGoal();
  const [manualScenarioId, setManualScenarioId] = useState<ReceptionistDemoScenario["id"] | null>(null);
  const [phase, setPhase] = useState<"answering" | "transcript" | "summary" | "routed">("routed");
  const [visibleFieldCount, setVisibleFieldCount] = useState(0);
  const reducedMotionRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const scenario =
    receptionistDemoScenarios[manualScenarioId ?? selectedGoal.demoScenarioId] ??
    receptionistDemoScenarios[defaultReceptionistDemoScenarioId];

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    setVisibleFieldCount(0);

    if (reducedMotionRef.current) {
      setPhase("routed");
      setVisibleFieldCount(scenario.capturedFields.length);
      return;
    }

    setPhase("answering");
    const schedule = (delay: number, run: () => void) => {
      timersRef.current.push(window.setTimeout(run, delay));
    };

    schedule(900, () => setPhase("transcript"));
    scenario.capturedFields.forEach((_, index) => {
      schedule(1000 + index * 350, () => setVisibleFieldCount((count) => Math.max(count, index + 1)));
    });
    schedule(1000 + scenario.capturedFields.length * 350 + 200, () => setPhase("summary"));
    schedule(1000 + scenario.capturedFields.length * 350 + 900, () => setPhase("routed"));

    return () => {
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
    };
  }, [scenario]);

  const waveformBars = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
  const isAnswering = phase === "answering";

  return (
    <div className="mt-6 rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-muted))] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-accent-background)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--sm-button-accent-text)]">
          Interactive Demo — No Live Call
        </span>
      </div>

      <div role="radiogroup" aria-label="Choose a demo scenario" className="mt-4 flex flex-wrap gap-1.5">
        {SCENARIO_IDS.map((id) => {
          const isActive = id === scenario.id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setManualScenarioId(id)}
              className="rounded-[var(--sm-radius-pill)] border px-3 py-1 text-[11px] font-medium transition-all"
              style={{
                borderColor: isActive ? "hsl(var(--sm-mint-500))" : "hsl(var(--sm-color-border-default))",
                backgroundColor: isActive ? "hsl(var(--sm-mint-100))" : "transparent",
                color: isActive ? "hsl(var(--sm-color-action-primary))" : "hsl(var(--sm-color-text-muted))",
              }}
            >
              {receptionistDemoScenarios[id].scenarioLabel}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-mint-100))] text-[hsl(var(--sm-color-action-primary))]">
          <MessageSquareText size={15} aria-hidden="true" />
        </span>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-[hsl(var(--sm-color-text-primary))]">Incoming customer inquiry ({scenario.inquiry.channel})</p>
          <p className="mt-1 text-[hsl(var(--sm-color-text-secondary))]">
            <span className="inline-flex items-center gap-1 font-medium">
              <User size={12} aria-hidden="true" /> {scenario.inquiry.name}
            </span>
            {" — "}
            {scenario.inquiry.reason}
          </p>

          {/* Simulated waveform — CSS-only, paused/skipped under reduced motion via the phase state machine above. */}
          {isAnswering && (
            <div aria-hidden="true" className="mt-2 flex h-5 items-end gap-[3px]">
              {waveformBars.map((bar) => (
                <span
                  key={bar}
                  className="pp-waveform-bar w-[3px] rounded-full bg-[hsl(var(--sm-mint-500))]"
                  style={{ animationDelay: `${bar * 70}ms` }}
                />
              ))}
              <span className="ml-2 text-[11px] text-[hsl(var(--sm-color-text-muted))]">Answering…</span>
            </div>
          )}
        </div>
      </div>

      {(phase === "transcript" || phase === "summary" || phase === "routed") && (
        <div className="mt-3 rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Transcript (synthetic)</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {scenario.capturedFields.slice(0, visibleFieldCount || scenario.capturedFields.length).map((field, index) => (
              <li
                key={field}
                className="pp-reveal flex items-center gap-1.5 text-xs text-[hsl(var(--sm-color-text-secondary))]"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <CheckCircle2 size={12} aria-hidden="true" className="text-[hsl(var(--sm-color-status-success))]" />
                {field} captured
              </li>
            ))}
          </ul>
        </div>
      )}

      {(phase === "summary" || phase === "routed") && (
        <div className="pp-reveal mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Lead summary</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {scenario.capturedFields.map((field) => (
                <li key={field} className="text-xs text-[hsl(var(--sm-color-text-secondary))]">
                  {field}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--sm-radius-md)] bg-[hsl(var(--sm-color-surface-default))] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-muted))]">Routing result</p>
            <p className="mt-1.5 text-xs text-[hsl(var(--sm-color-text-secondary))]">{scenario.nextAction}</p>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-snug text-[hsl(var(--sm-color-text-muted))]">
        Synthetic example, not a live conversation — no real call, provider connection, or customer record.
      </p>
    </div>
  );
}
