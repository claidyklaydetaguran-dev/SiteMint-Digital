import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

function AdvancedField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 font-mono text-sm"
      />
    </div>
  );
}

export default function AdvancedTab({ draft, update }: BuilderTabProps) {
  const { advanced } = draft;
  const set = (patch: Partial<typeof advanced>) =>
    update((d) => ({ ...d, advanced: { ...d.advanced, ...patch } }));

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Advanced</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Provider-level configuration. This is the only tab where provider names appear.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/10 px-3.5 py-2.5 text-xs text-foreground">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-info" aria-hidden="true" />
        <div>
          <p className="font-semibold">Advanced preview</p>
          <p className="mt-0.5 text-muted-foreground">Provider integration is not connected.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AdvancedField id="voice-runtime-provider" label="Voice runtime provider" value={advanced.voiceRuntimeProvider} onChange={(v) => set({ voiceRuntimeProvider: v })} placeholder="Not connected" />
        <AdvancedField id="model-provider" label="Model provider" value={advanced.modelProvider} onChange={(v) => set({ modelProvider: v })} placeholder="Not connected" />
        <AdvancedField id="model-identifier" label="Model identifier" value={advanced.modelIdentifier} onChange={(v) => set({ modelIdentifier: v })} placeholder="Not connected" />
        <AdvancedField id="voice-provider" label="Voice provider" value={advanced.voiceProvider} onChange={(v) => set({ voiceProvider: v })} placeholder="Not connected" />
        <AdvancedField id="voice-identifier" label="Voice identifier" value={advanced.voiceIdentifier} onChange={(v) => set({ voiceIdentifier: v })} placeholder="Not connected" />
        <AdvancedField id="transcriber" label="Transcriber" value={advanced.transcriber} onChange={(v) => set({ transcriber: v })} placeholder="Not connected" />
        <AdvancedField id="timeout-seconds" label="Timeouts (seconds)" value={advanced.timeoutSeconds} onChange={(v) => set({ timeoutSeconds: v })} placeholder="e.g. 30" />
        <AdvancedField id="endpointing-ms" label="Endpointing (ms)" value={advanced.endpointingMs} onChange={(v) => set({ endpointingMs: v })} placeholder="e.g. 500" />
      </div>

      <div>
        <label htmlFor="raw-overrides" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground">
          Raw overrides
        </label>
        <Textarea
          id="raw-overrides"
          value={advanced.rawOverrides}
          onChange={(e) => set({ rawOverrides: e.target.value })}
          placeholder="Local-only notes for advanced configuration overrides"
          rows={5}
          className="resize-none font-mono text-xs"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Local preview only — no credentials, secrets, or environment variables are shown or
          stored here.
        </p>
      </div>
    </div>
  );
}
