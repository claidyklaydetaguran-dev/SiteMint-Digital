import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CharCountField } from "@/components/common/CharCountField";
import { CONFIGURATION } from "@/pages/assistants/assistantsContract";
import { ROUTES } from "@/lib/routes";
import type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

/**
 * V5 PR-6 (C-2): "Setup" renamed "Configuration". Business name and industry
 * are no longer editable here — AR-001I's SetupTab had them as free-text
 * fields that silently diverged from Workspace Settings. They are now a
 * read-only display sourced from `useWorkspaceBusinessInfo` (see
 * `BuilderShell.tsx`, which fetches it once and passes it down), with a link
 * to the page that actually owns them.
 */

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

export default function ConfigurationTab({ draft, update, businessInfo }: BuilderTabProps) {
  const { setup, prompt } = draft;
  const setSetup = (patch: Partial<typeof setup>) =>
    update((d) => ({ ...d, setup: { ...d.setup, ...patch } }));
  const setPrompt = (patch: Partial<typeof prompt>) =>
    update((d) => ({ ...d, prompt: { ...d.prompt, ...patch } }));

  const businessName = businessInfo?.name || setup.businessName;
  const industry = businessInfo?.industry || setup.industry;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">{CONFIGURATION.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{CONFIGURATION.detail}</p>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {CONFIGURATION.businessFromWorkspace}
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {businessName || "Not set"}
              {industry ? ` · ${industry}` : ""}
            </p>
          </div>
          <Link
            href={ROUTES.settings}
            className="inline-flex min-h-8 flex-shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {CONFIGURATION.editWorkspaceSettings}
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="assistant-name" label="Assistant name" value={setup.assistantName} onChange={(v) => setSetup({ assistantName: v })} placeholder="e.g. Front Desk Assistant" />
        <Field id="role" label="Role" value={setup.role} onChange={(v) => setSetup({ role: v })} placeholder="e.g. Front-desk receptionist" />
        <Field id="primary-goal" label="Primary goal" value={setup.primaryGoal} onChange={(v) => setSetup({ primaryGoal: v })} placeholder="What should this assistant accomplish on most calls?" />
        <Field id="timezone" label="Business timezone" value={setup.timezone} onChange={(v) => setSetup({ timezone: v })} placeholder="e.g. America/New_York" />
        <Field id="language" label="Supported language" value={setup.language} onChange={(v) => setSetup({ language: v })} placeholder="e.g. English (US)" />
      </div>

      {/* The greeting moved to "Greeting & voice", where it sits beside the
          voice that speaks it. It is one decision for a business owner, and
          splitting it across two screens is part of what made this journey
          read as a configuration editor. */}
      <CharCountField
        id="business-context"
        label="Business context"
        value={prompt.businessInformation}
        onChange={(v) => setPrompt({ businessInformation: v })}
        maxLength={2000}
        rows={4}
        placeholder="Hours, location, services, policies — anything the assistant needs to answer questions accurately."
      />

      {/* "What you want it to do" and the hand-over rule moved to the
          "What it can do" section, where they sit next to what the assistant
          can ACTUALLY do — so a ticked box that is not yet available says so. */}
    </div>
  );
}
