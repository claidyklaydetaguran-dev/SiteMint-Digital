import { Input } from "@/components/ui/input";
import { DisabledFeatureCard } from "@/components/common/DisabledFeatureCard";
import { Phone } from "lucide-react";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  helpText,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
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
        className="h-9 text-sm"
        aria-describedby={helpText ? `${id}-help` : undefined}
      />
      {helpText && (
        <p id={`${id}-help`} className="mt-1 text-[11px] text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  );
}

export default function SetupTab({ draft, update }: BuilderTabProps) {
  const { setup } = draft;
  const set = (patch: Partial<typeof setup>) =>
    update((d) => ({ ...d, setup: { ...d.setup, ...patch } }));

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Setup</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The basics — who this assistant is for and what it's trying to accomplish.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="assistant-name" label="Assistant name" value={setup.assistantName} onChange={(v) => set({ assistantName: v })} placeholder="e.g. Front Desk Assistant" />
        <Field id="business-name" label="Business name" value={setup.businessName} onChange={(v) => set({ businessName: v })} placeholder="Your business name" />
        <Field id="role" label="Role" value={setup.role} onChange={(v) => set({ role: v })} placeholder="e.g. Front-desk receptionist" />
        <Field id="industry" label="Industry" value={setup.industry} onChange={(v) => set({ industry: v })} placeholder="e.g. Dental clinic" />
        <Field id="timezone" label="Business timezone" value={setup.timezone} onChange={(v) => set({ timezone: v })} placeholder="e.g. America/New_York" />
        <Field id="language" label="Primary language" value={setup.language} onChange={(v) => set({ language: v })} placeholder="e.g. English (US)" />
      </div>

      <Field
        id="primary-goal"
        label="Primary goal"
        value={setup.primaryGoal}
        onChange={(v) => set({ primaryGoal: v })}
        placeholder="What should this assistant accomplish on most calls?"
        helpText="A short sentence describing the main outcome this assistant should drive toward."
      />

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">Assigned phone number</p>
        <DisabledFeatureCard
          icon={Phone}
          title="No number assigned"
          description="Connect or provision a number to route calls to this assistant."
          availability="Available after Phone Numbers setup"
        />
      </div>
    </div>
  );
}
