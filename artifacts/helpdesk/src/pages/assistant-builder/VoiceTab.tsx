import { AlertTriangle, Check, ChevronDown, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CharCountField } from "@/components/common/CharCountField";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { VoiceSamplePlayer } from "@/components/common/VoiceSamplePlayer";
import { findVoicePreset } from "@/lib/assistantEstimates";
import { effectiveVoiceKey, unavailableChoice, useVoiceOptions } from "@/lib/voiceOptions";
import { VOICE_MODEL, VOICE_UNAVAILABLE } from "@/pages/assistants/assistantsContract";
import type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

/**
 * "Greeting & voice" — what callers hear first, and the voice that says it.
 *
 * Voices and response styles come from the server's own catalog, so every
 * choice shown here can be published in this environment. A voice is who
 * speaks; a response style is how quickly and carefully the assistant
 * answers — two separate decisions. A saved choice this environment can no
 * longer publish is reported with the available replacements and is never
 * changed on the business's behalf.
 *
 * Cards are `div role="radio"` rather than buttons because each voice card
 * holds its own Play control, and a button inside a button is invalid.
 */

const MUTED = {
  margin: "var(--sd-space-1, .25rem) 0 0",
  fontSize: "var(--sd-text-small, .8125rem)",
  lineHeight: 1.55,
  color: "var(--sd-text-muted, #3b5265)",
} as const;

const CHOICE_GRID = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))",
  gap: "var(--sd-space-3, .75rem)",
  minWidth: 0,
} as const;

function choiceStyle(active: boolean) {
  return {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--sd-space-2, .5rem)",
    minWidth: 0,
    minHeight: 44,
    padding: "var(--sd-space-4, 1rem)",
    border: `${active ? 2 : 1}px solid ${active ? "var(--sd-accent, #27e9b5)" : "var(--sd-border, rgba(59,82,101,.12))"}`,
    borderRadius: "var(--sd-radius-card, 10px)",
    background: active ? "var(--sd-surface-accent, #f0f9f6)" : "var(--sd-surface, #fff)",
    cursor: "pointer",
    textAlign: "left" as const,
    font: "inherit",
  };
}

function ChoiceHead({ label, active, badge }: { label: string; active: boolean; badge?: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sd-space-2, .5rem)" }}>
      <span style={{ minWidth: 0, fontSize: "var(--sd-text-body, .875rem)", fontWeight: 600, color: "var(--sd-text, #051824)", overflowWrap: "anywhere" }}>
        {label}
        {badge && (
          <span style={{ marginLeft: 8, fontSize: "var(--sd-text-micro, .6875rem)", fontWeight: 600, color: "var(--sd-accent-ink, #0b5f4b)" }}>{badge}</span>
        )}
      </span>
      {active && (
        <span
          aria-hidden="true"
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--sd-accent, #27e9b5)",
            color: "var(--sd-accent-ink, #051824)",
          }}
        >
          <Check style={{ width: 12, height: 12 }} />
        </span>
      )}
    </span>
  );
}

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="sd-error" role="status" style={{ borderColor: "var(--sd-warn-border, rgba(138,82,0,.28))", background: "var(--sd-warn-surface, #fdf6ec)" }}>
      <AlertTriangle className="sd-error__icon" style={{ color: "var(--sd-warn, #8a5200)" }} aria-hidden="true" />
      <div className="sd-error__body">
        <span className="sd-error__title">{title}</span>
        <p className="sd-error__detail" style={{ color: "var(--sd-warn, #8a5200)" }}>{detail}</p>
      </div>
    </div>
  );
}

export default function VoiceTab({ draft, update }: BuilderTabProps) {
  const options = useVoiceOptions();
  const setPrompt = (patch: Partial<typeof draft.prompt>) =>
    update((d) => ({ ...d, prompt: { ...d.prompt, ...patch } }));
  const chooseVoice = (key: string) => update((d) => ({ ...d, voiceModel: { ...d.voiceModel, voice: key } }));
  const chooseStyle = (key: string) =>
    update((d) => ({ ...d, voiceModel: { ...d.voiceModel, preset: key as typeof d.voiceModel.preset } }));

  const preset = draft.voiceModel.preset;
  const voice = draft.voiceModel.voice ?? null;
  const estimates = findVoicePreset(preset);

  return (
    <>
      <div>
        <h2 className="sd-h2">{VOICE_MODEL.title}</h2>
        <p style={MUTED}>{VOICE_MODEL.detail}</p>
      </div>

      <CharCountField
        id="greeting"
        label="Greeting"
        value={draft.prompt.firstMessage}
        onChange={(v) => setPrompt({ firstMessage: v })}
        maxLength={300}
        rows={2}
        placeholder="What the assistant says first"
        helpText={VOICE_MODEL.greetingHelp}
      />

      {options.isLoading && (
        <p style={MUTED} role="status">
          <Loader2 className="inline h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading voices…
        </p>
      )}
      {options.isError && (
        <div className="sd-error" role="alert">
          <AlertTriangle className="sd-error__icon" aria-hidden="true" />
          <div className="sd-error__body">
            <span className="sd-error__title">Voices couldn't be loaded</span>
            <p className="sd-error__detail">{(options.error as Error).message} Your saved choice is unchanged.</p>
            <button type="button" className="sd-error__action" onClick={() => void options.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {options.data && (() => {
        const opts = options.data;
        const current = effectiveVoiceKey(opts, preset, voice);
        const problem = unavailableChoice(opts, preset, voice);
        return (
          <>
            {problem === "style" && <Notice title={VOICE_UNAVAILABLE.styleTitle} detail={VOICE_UNAVAILABLE.styleDetail} />}
            {problem === "voice" && <Notice title={VOICE_UNAVAILABLE.voiceTitle} detail={VOICE_UNAVAILABLE.voiceDetail} />}

            <div>
              <h3 className="sd-h2">{VOICE_MODEL.voiceHeading}</h3>
              <p style={MUTED}>{VOICE_MODEL.voiceDetail}</p>
              {opts.voices.length === 0 ? (
                <p style={MUTED}>{VOICE_MODEL.singleVoice}</p>
              ) : (
                <div role="radiogroup" aria-label={VOICE_MODEL.voiceHeading} style={{ ...CHOICE_GRID, marginTop: "var(--sd-space-3, .75rem)" }}>
                  {opts.voices.map((v) => {
                    const active = v.key === current;
                    return (
                      <div
                        key={v.key}
                        role="radio"
                        aria-checked={active}
                        tabIndex={0}
                        onClick={() => chooseVoice(v.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            chooseVoice(v.key);
                          }
                        }}
                        style={choiceStyle(active)}
                      >
                        <ChoiceHead label={v.label} active={active} badge={v.key === opts.defaultVoice ? "Recommended" : undefined} />
                        <span style={{ ...MUTED, marginTop: 0 }}>{v.description}</span>
                        <VoiceSamplePlayer voiceKey={v.key} voiceLabel={v.label} />
                      </div>
                    );
                  })}
                </div>
              )}
              <p style={{ ...MUTED, marginTop: "var(--sd-space-3, .75rem)" }}>{VOICE_MODEL.greetingPreviewNote}</p>
            </div>

            <div>
              <h3 className="sd-h2">{VOICE_MODEL.styleHeading}</h3>
              <p style={MUTED}>{VOICE_MODEL.styleDetail}</p>
              <div role="radiogroup" aria-label={VOICE_MODEL.styleHeading} style={{ ...CHOICE_GRID, marginTop: "var(--sd-space-3, .75rem)" }}>
                {opts.styles.map((s) => {
                  const active = s.key === preset;
                  return (
                    <button key={s.key} type="button" role="radio" aria-checked={active} onClick={() => chooseStyle(s.key)} style={choiceStyle(active)}>
                      <ChoiceHead label={s.label} active={active} badge={s.key === opts.defaultStyle ? "Recommended" : undefined} />
                      <span style={{ ...MUTED, marginTop: 0 }}>{s.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      <Collapsible>
        <CollapsibleTrigger
          className="sd-error__action"
          style={{ width: "100%", justifyContent: "space-between", background: "var(--sd-surface-alt, #f6fbfa)" }}
        >
          {VOICE_MODEL.advancedHeading}
          <ChevronDown className="sd-navlink__icon" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sd-space-4, 1rem)",
              marginTop: "var(--sd-space-3, .75rem)",
              padding: "var(--sd-space-4, 1rem)",
              border: "1px dashed var(--sd-border-strong, rgba(59,82,101,.24))",
              borderRadius: "var(--sd-radius-card, 10px)",
              minWidth: 0,
            }}
          >
            <p style={{ ...MUTED, marginTop: 0 }}>{VOICE_MODEL.advancedDetail}</p>
            {estimates ? (
              <div style={CHOICE_GRID}>
                <div style={{ padding: "var(--sd-space-4, 1rem)", border: "1px solid var(--sd-border, rgba(59,82,101,.12))", borderRadius: "var(--sd-radius-card, 10px)", background: "var(--sd-surface, #fff)", minWidth: 0 }}>
                  <CostBreakdown preset={estimates} />
                </div>
                <div style={{ padding: "var(--sd-space-4, 1rem)", border: "1px solid var(--sd-border, rgba(59,82,101,.12))", borderRadius: "var(--sd-radius-card, 10px)", background: "var(--sd-surface, #fff)", minWidth: 0 }}>
                  <LatencyMeter latencyMs={estimates.latencyMs} breakdown={estimates.latencyBreakdown} />
                </div>
              </div>
            ) : (
              <p style={MUTED}>Estimates appear once a response style is chosen.</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
