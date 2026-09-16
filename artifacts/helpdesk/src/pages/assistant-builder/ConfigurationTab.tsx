import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { CharCountField } from "@/components/common/CharCountField";
import { CONFIGURATION } from "@/pages/assistants/assistantsContract";
import { ROUTES } from "@/lib/routes";
import type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

/**
 * "Business information" — who this assistant is for, and the facts it may
 * rely on when answering.
 *
 * Business name and industry are not editable here. They are read live from
 * Workspace Settings (see `BuilderShell.tsx`, which fetches them once and
 * passes them down) and shown for reference with a link to the page that owns
 * them, because free-text copies of them used to drift silently.
 *
 * The assistant's own name is not repeated here either: it is edited once, in
 * the builder header, where it stays visible from every section. Two inputs
 * bound to one value on the same screen is a question, not a feature.
 *
 * Presentation only — the shared `si-*` field classes, inside the `si-form`
 * the shell wraps every section in.
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
    <div className="si-field">
      <label htmlFor={id} className="si-label">
        {label}
      </label>
      <input
        id={id}
        className="si-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={helpText ? `${id}-help` : undefined}
      />
      {helpText && (
        <p className="si-hint" id={`${id}-help`}>
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
    <>
      <div>
        <h2 className="sd-h2">{CONFIGURATION.title}</h2>
        <p
          style={{
            margin: "var(--sd-space-1, .25rem) 0 0",
            fontSize: "var(--sd-text-small, .8125rem)",
            lineHeight: 1.55,
            color: "var(--sd-text-muted, #3b5265)",
          }}
        >
          {CONFIGURATION.detail}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sd-space-3, .75rem)",
          padding: "var(--sd-space-3, .75rem) var(--sd-space-4, 1rem)",
          border: "1px dashed var(--sd-border-strong, rgba(59,82,101,.24))",
          borderRadius: "var(--sd-radius-control, 6px)",
          background: "var(--sd-surface-alt, #f6fbfa)",
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span className="sd-eyebrow" style={{ color: "var(--sd-text-muted, #3b5265)" }}>
            {CONFIGURATION.businessFromWorkspace}
          </span>
          <p
            style={{
              margin: "var(--sd-space-1, .25rem) 0 0",
              fontSize: "var(--sd-text-body, .875rem)",
              fontWeight: 600,
              color: "var(--sd-text, #051824)",
              overflowWrap: "anywhere",
            }}
          >
            {businessName || "Not set"}
            {industry ? ` · ${industry}` : ""}
          </p>
        </div>
        <Link href={ROUTES.settings} className="sd-link">
          {CONFIGURATION.editWorkspaceSettings}
          <ArrowUpRight className="sd-navlink__icon" aria-hidden="true" />
        </Link>
      </div>

      <Field
        id="role"
        label="Role"
        value={setup.role}
        onChange={(v) => setSetup({ role: v })}
        placeholder="e.g. Front-desk receptionist"
      />
      <Field
        id="primary-goal"
        label="Primary goal"
        value={setup.primaryGoal}
        onChange={(v) => setSetup({ primaryGoal: v })}
        placeholder="What should this assistant accomplish on most calls?"
      />
      <Field
        id="timezone"
        label="Business timezone"
        value={setup.timezone}
        onChange={(v) => setSetup({ timezone: v })}
        placeholder="e.g. America/New_York"
        helpText="Needed before publishing, so any times it offers are the ones you actually keep."
      />
      <Field
        id="language"
        label="Supported language"
        value={setup.language}
        onChange={(v) => setSetup({ language: v })}
        placeholder="e.g. English (US)"
      />

      <CharCountField
        id="business-context"
        label="Business context"
        value={prompt.businessInformation}
        onChange={(v) => setPrompt({ businessInformation: v })}
        maxLength={2000}
        rows={4}
        placeholder="Hours, location, services, policies — anything the assistant needs to answer questions accurately."
        helpText="The more specific this is, the fewer questions it has to guess at."
      />
    </>
  );
}
