import { BrainCircuit, AudioLines, Ear, Cpu, AlertTriangle, Check, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CharCountField } from "@/components/common/CharCountField";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { VoiceSamplePlayer } from "@/components/common/VoiceSamplePlayer";
import { VOICE_MODEL_PRESETS, findVoicePreset } from "@/lib/assistantEstimates";
import {
  PRESET_RECOVERY,
  VOICE_MODEL,
  isCuratedVoicePreset,
  type SupportedVoicePresetId,
} from "@/pages/assistants/assistantsContract";
import type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

/**
 * "Greeting & voice" — what callers hear first, and the voice that says it.
 *
 * Two curated presets are the primary choice, each with a sample player and a
 * plain-language description. The other two supported presets, and the
 * provider/model detail, live under Advanced — still fully selectable and
 * still fully publishable, just not presented as a first choice. A saved
 * config carrying a retired preset still gets the truthful recovery state
 * above the picker; that behaviour is unchanged.
 *
 * Presentation only in this pass. The curated cards stay `div`s carrying
 * `role="radio"` rather than becoming `button`s, because each one contains its
 * own Play control and a button inside a button is invalid.
 */

const FRIENDLY_STACK = [
  { icon: BrainCircuit, label: "Conversational model", desc: "Understands the caller and decides how to respond." },
  { icon: AudioLines, label: "Natural voice", desc: "Speaks back in a clear, human-sounding voice." },
  { icon: Ear, label: "Accurate transcription", desc: "Turns what the caller says into text the assistant can use." },
  { icon: Cpu, label: "SiteMint voice runtime", desc: "Coordinates the conversation in real time." },
];

const CURATED_PRESETS = VOICE_MODEL_PRESETS.filter((p) => isCuratedVoicePreset(p.id));
const MORE_PRESETS = VOICE_MODEL_PRESETS.filter((p) => !isCuratedVoicePreset(p.id));

const MUTED = {
  margin: "var(--sd-space-1, .25rem) 0 0",
  fontSize: "var(--sd-text-small, .8125rem)",
  lineHeight: 1.55,
  color: "var(--sd-text-muted, #3b5265)",
} as const;

const CHOICE_GRID = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
  gap: "var(--sd-space-3, .75rem)",
  minWidth: 0,
} as const;

function choiceStyle(active: boolean) {
  return {
    display: "flex",
    flexDirection: "column" as const,
    gap: "var(--sd-space-2, .5rem)",
    minWidth: 0,
    padding: "var(--sd-space-4, 1rem)",
    border: `1px solid ${active ? "var(--sd-accent, #27e9b5)" : "var(--sd-border, rgba(59,82,101,.12))"}`,
    borderRadius: "var(--sd-radius-card, 10px)",
    background: active ? "var(--sd-surface-accent, #f0f9f6)" : "var(--sd-surface, #fff)",
    cursor: "pointer",
    textAlign: "left" as const,
  };
}

function ChoiceHead({ label, active }: { label: string; active: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sd-space-2, .5rem)" }}>
      <span
        style={{
          minWidth: 0,
          fontSize: "var(--sd-text-body, .875rem)",
          fontWeight: 600,
          color: "var(--sd-text, #051824)",
          overflowWrap: "anywhere",
        }}
      >
        {label}
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

export default function VoiceTab({ draft, update }: BuilderTabProps) {
  // The greeting lives here, with the voice that speaks it — the two are one
  // decision for a business owner ("what do callers hear first?"), and
  // splitting them across two screens is what made this journey feel like a
  // config editor.
  const setPrompt = (patch: Partial<typeof draft.prompt>) =>
    update((d) => ({ ...d, prompt: { ...d.prompt, ...patch } }));
  const preset = findVoicePreset(draft.voiceModel.preset);
  const selectedIsCurated = isCuratedVoicePreset(draft.voiceModel.preset);

  const choosePreset = (id: SupportedVoicePresetId) =>
    update((d) => ({ ...d, voiceModel: { ...d.voiceModel, preset: id } }));

  return (
    <>
      <div>
        <h2 className="sd-h2">{VOICE_MODEL.title}</h2>
        <p style={MUTED}>{VOICE_MODEL.detail}</p>
      </div>

      {/* The first thing a caller hears, above the voice that says it. */}
      <CharCountField
        id="greeting"
        label="Greeting"
        value={draft.prompt.firstMessage}
        onChange={(v) => setPrompt({ firstMessage: v })}
        maxLength={300}
        rows={2}
        placeholder="What the assistant says first"
        helpText="The opening line on every call. Also editable under Advanced."
      />

      {preset === undefined && (
        <div className="sd-error" role="status" style={{ borderColor: "var(--sd-warn-border, rgba(138,82,0,.28))", background: "var(--sd-warn-surface, #fdf6ec)" }}>
          <AlertTriangle className="sd-error__icon" style={{ color: "var(--sd-warn, #8a5200)" }} aria-hidden="true" />
          <div className="sd-error__body">
            <span className="sd-error__title">{PRESET_RECOVERY.title}</span>
            <p className="sd-error__detail" style={{ color: "var(--sd-warn, #8a5200)" }}>
              {PRESET_RECOVERY.detail}
            </p>
          </div>
        </div>
      )}

      <div>
        <p style={{ ...MUTED, marginTop: 0 }}>{VOICE_MODEL.curatedNote}</p>
        <div role="radiogroup" aria-label={VOICE_MODEL.presetGroupLabel} style={CHOICE_GRID}>
          {CURATED_PRESETS.map((p) => {
            const active = p.id === draft.voiceModel.preset;
            return (
              <div
                key={p.id}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => choosePreset(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choosePreset(p.id);
                  }
                }}
                style={choiceStyle(active)}
              >
                <ChoiceHead label={p.label} active={active} />
                <span style={{ ...MUTED, marginTop: 0 }}>{p.friendlyDescription}</span>
                <VoiceSamplePlayer presetId={p.id} presetLabel={p.label} />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="sd-h2">{VOICE_MODEL.includedHeading}</h3>
        <ul className="sd-list" style={{ marginTop: "var(--sd-space-3, .75rem)" }}>
          {FRIENDLY_STACK.map((item) => (
            <li className="sd-list__item" key={item.label}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--sd-space-3, .75rem)",
                  padding: "var(--sd-space-3, .75rem) var(--sd-space-4, 1rem)",
                  minWidth: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flex: "0 0 auto",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: "var(--sd-radius-control, 6px)",
                    background: "var(--sd-surface-accent, #f0f9f6)",
                    color: "var(--sd-accent-ink, #051824)",
                  }}
                >
                  <item.icon className="sd-navlink__icon" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "var(--sd-text-body, .875rem)",
                      fontWeight: 600,
                      color: "var(--sd-text, #051824)",
                    }}
                  >
                    {item.label}
                  </span>
                  <span style={{ ...MUTED, display: "block" }}>{item.desc}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {preset === undefined ? (
        <p
          style={{
            margin: 0,
            padding: "var(--sd-space-4, 1rem)",
            border: "1px dashed var(--sd-border-strong, rgba(59,82,101,.24))",
            borderRadius: "var(--sd-radius-control, 6px)",
            background: "var(--sd-surface-alt, #f6fbfa)",
            fontSize: "var(--sd-text-small, .8125rem)",
            color: "var(--sd-text-muted, #3b5265)",
          }}
        >
          {PRESET_RECOVERY.estimatesUnavailable}
        </p>
      ) : (
        <div style={CHOICE_GRID}>
          <div
            style={{
              padding: "var(--sd-space-4, 1rem)",
              border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
              borderRadius: "var(--sd-radius-card, 10px)",
              background: "var(--sd-surface, #fff)",
              minWidth: 0,
            }}
          >
            <CostBreakdown preset={preset} />
          </div>
          <div
            style={{
              padding: "var(--sd-space-4, 1rem)",
              border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
              borderRadius: "var(--sd-radius-card, 10px)",
              background: "var(--sd-surface, #fff)",
              minWidth: 0,
            }}
          >
            <LatencyMeter latencyMs={preset.latencyMs} breakdown={preset.latencyBreakdown} />
          </div>
        </div>
      )}

      <Collapsible defaultOpen={!selectedIsCurated}>
        <CollapsibleTrigger
          className="sd-error__action"
          style={{ width: "100%", justifyContent: "space-between", background: "var(--sd-surface-alt, #f6fbfa)" }}
        >
          Advanced
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
            <div>
              <h3 className="sd-h2">{VOICE_MODEL.moreOptionsHeading}</h3>
              <p style={MUTED}>{VOICE_MODEL.moreOptionsDetail}</p>
              <div
                role="radiogroup"
                aria-label={VOICE_MODEL.moreOptionsHeading}
                style={{ ...CHOICE_GRID, marginTop: "var(--sd-space-3, .75rem)" }}
              >
                {MORE_PRESETS.map((p) => {
                  const active = p.id === draft.voiceModel.preset;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => choosePreset(p.id)}
                      style={{ ...choiceStyle(active), font: "inherit", minHeight: 44 }}
                    >
                      <ChoiceHead label={p.label} active={active} />
                      <span style={{ ...MUTED, marginTop: 0 }}>{p.friendlyDescription}</span>
                      <span
                        style={{
                          fontSize: "var(--sd-text-micro, .6875rem)",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--sd-text-muted, #3b5265)",
                        }}
                      >
                        Est. ${p.costRangeLow.toFixed(2)}–${p.costRangeHigh.toFixed(2)}/min · ~{p.latencyMs} ms
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="sd-h2">{VOICE_MODEL.advancedHeading}</h3>
              <p style={MUTED}>
                Model, voice and transcription providers are chosen by the selected preset above. There is no
                separate per-provider selection in this build.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
