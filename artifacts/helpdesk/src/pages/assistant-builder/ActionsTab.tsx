/**
 * "What it can do" — the actions the assistant may take on a call.
 *
 * Two different questions live on this screen, and the whole point is that
 * they are not merged:
 *
 *   WHAT YOU WANT IT TO DO — the checkboxes. Part of the assistant draft,
 *     saved with everything else, and entirely under the customer's control.
 *   WHAT IT CAN ACTUALLY DO — the capability cards. Derived by the server
 *     from the published payload's own rules, and not editable here.
 *
 * Before this screen existed, only the first was shown. A customer could tick
 * "Book appointments", save, publish, and reasonably believe callers could
 * book — while the published assistant carried no booking tool at all. A
 * ticked action whose capability is unavailable now says so, next to the tick,
 * with the specific thing that would unblock it.
 *
 * Presentation only in this pass: the shared `sd-*` and `si-*` vocabulary
 * replaces the utility classes. Every state the screen could reach before —
 * loading, failed, nothing attachable, blocked-with-a-reason — is still here,
 * and the failure is still announced.
 */

import { Link } from "wouter";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CharCountField } from "@/components/common/CharCountField";
import { useAssistantCapabilities } from "@/hooks/useInquiries";
import { ROUTES } from "@/lib/routes";
import type { AssistantCapability } from "@/lib/inquiriesApi";
import type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";
import { PERMITTED_ACTIONS } from "@/lib/promptComposer";
import { ACTIONS, capabilityForAction } from "@/pages/assistants/assistantsContract";

/** Where a customer goes to clear each blocker, when they can clear it themselves. */
const BLOCKER_LINK: Record<string, { href: string; label: string } | undefined> = {
  needs_appointment_type: { href: ROUTES.appointmentTypes, label: "Add an appointment type" },
  needs_transfer_contact: { href: ROUTES.transferContacts, label: "Add a transfer contact" },
};

const MUTED = {
  margin: "var(--sd-space-1, .25rem) 0 0",
  fontSize: "var(--sd-text-small, .8125rem)",
  lineHeight: 1.55,
  color: "var(--sd-text-muted, #3b5265)",
} as const;

function CapabilityCard({ capability }: { capability: AssistantCapability }) {
  const active = capability.state === "active";
  const link = capability.blockedBy ? BLOCKER_LINK[capability.blockedBy] : undefined;

  return (
    <li className="sd-list__item">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--sd-space-3, .75rem)",
          padding: "var(--sd-space-4, 1rem)",
          minWidth: 0,
        }}
      >
        {active ? (
          <CheckCircle2
            className="sd-navlink__icon"
            style={{ flex: "0 0 auto", marginTop: 2, color: "var(--sd-accent-ink, #051824)" }}
            aria-hidden="true"
          />
        ) : (
          <AlertTriangle
            className="sd-navlink__icon"
            style={{ flex: "0 0 auto", marginTop: 2, color: "var(--sd-warn, #8a5200)" }}
            aria-hidden="true"
          />
        )}
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: "var(--sd-text-body, .875rem)",
              fontWeight: 600,
              color: "var(--sd-text, #051824)",
            }}
          >
            {capability.label}
            <span
              style={{
                marginLeft: "var(--sd-space-2, .5rem)",
                fontSize: "var(--sd-text-micro, .6875rem)",
                fontWeight: 600,
                letterSpacing: "var(--sd-tracking-eyebrow, .1em)",
                textTransform: "uppercase",
                color: "var(--sd-text-muted, #3b5265)",
              }}
            >
              {active ? ACTIONS.stateActive : ACTIONS.stateUnavailable}
            </span>
          </p>
          <p style={MUTED}>{capability.detail}</p>
          {link && (
            <Link href={link.href} className="sd-link">
              {link.label}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export function ActionsTab({ draft, update }: BuilderTabProps) {
  const capabilities = useAssistantCapabilities();
  const items = capabilities.data?.items ?? [];

  const tools = draft.tools;
  const prompt = draft.prompt;

  type PermittedActionId = (typeof draft.tools.permittedActions)[number];

  /**
   * Rebuilt from the catalog each time rather than appended to, so the saved
   * order always matches PERMITTED_ACTIONS. An order that drifts with click
   * order would make two identical configurations serialize differently, and
   * the publish digest would then report changes nobody made.
   */
  const togglePermittedAction = (id: string, checked: boolean) =>
    update((d) => {
      const current = new Set<string>(d.tools.permittedActions);
      if (checked) current.add(id);
      else current.delete(id);
      return {
        ...d,
        tools: {
          ...d.tools,
          permittedActions: PERMITTED_ACTIONS.map((a) => a.id).filter((a) =>
            current.has(a),
          ) as PermittedActionId[],
        },
      };
    });

  const setPrompt = (patch: Partial<typeof prompt>) =>
    update((d) => ({ ...d, prompt: { ...d.prompt, ...patch } }));

  /** The server's verdict for the capability an action depends on, if known. */
  const capabilityFor = (actionId: string): AssistantCapability | undefined => {
    const key = capabilityForAction(actionId);
    return key ? items.find((c) => c.key === key) : undefined;
  };

  return (
    <>
      <section className="sd-section" aria-labelledby="actions-available-title">
        <div>
          <h2 className="sd-h2" id="actions-available-title">
            {ACTIONS.availableTitle}
          </h2>
          <p style={MUTED}>{ACTIONS.availableDetail}</p>
        </div>

        {capabilities.isLoading && <p style={MUTED}>{ACTIONS.loading}</p>}

        {capabilities.isError && (
          <div className="sd-error" role="alert">
            <div className="sd-error__body">
              <span className="sd-error__title">{ACTIONS.loadFailed}</span>
            </div>
            <button type="button" className="sd-error__action" onClick={() => capabilities.refetch()}>
              Try again
            </button>
          </div>
        )}

        {!capabilities.isLoading && !capabilities.isError && (
          <>
            {capabilities.data && !capabilities.data.toolsAttachable && (
              <div className="sd-empty">
                <p className="sd-empty__detail">{ACTIONS.noneAttachable}</p>
              </div>
            )}
            {items.length > 0 && (
              <ul className="sd-list">
                {items.map((c) => (
                  <CapabilityCard key={c.key} capability={c} />
                ))}
              </ul>
            )}
            <p style={MUTED}>{ACTIONS.publishToApply}</p>
          </>
        )}
      </section>

      <section className="sd-section" aria-labelledby="actions-permitted-title">
        <div>
          <h2 className="sd-h2" id="actions-permitted-title">
            {ACTIONS.permittedTitle}
          </h2>
          <p style={MUTED}>{ACTIONS.permittedDetail}</p>
        </div>

        <ul className="sd-list">
          {PERMITTED_ACTIONS.map((action) => {
            const checked = tools.permittedActions.includes(action.id);
            const inputId = `permitted-action-${action.id}`;
            const capability = capabilityFor(action.id);
            // Only worth flagging when the customer has asked for something the
            // assistant cannot currently do. An unticked action needs no notice.
            const unavailable = checked && capability !== undefined && capability.state !== "active";
            return (
              <li className="sd-list__item" key={action.id}>
                <label
                  htmlFor={inputId}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--sd-space-3, .75rem)",
                    padding: "var(--sd-space-4, 1rem)",
                    cursor: "pointer",
                    minWidth: 0,
                  }}
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(v) => togglePermittedAction(action.id, v === true)}
                    style={{ flex: "0 0 auto", marginTop: 2 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: "var(--sd-text-body, .875rem)",
                        fontWeight: 600,
                        color: "var(--sd-text, #051824)",
                      }}
                    >
                      {action.label}
                    </span>
                    <span style={{ ...MUTED, display: "block" }}>{action.description}</span>
                    {unavailable && (
                      <span
                        style={{
                          display: "block",
                          margin: "var(--sd-space-2, .5rem) 0 0",
                          fontSize: "var(--sd-text-small, .8125rem)",
                          lineHeight: 1.5,
                          color: "var(--sd-warn, #8a5200)",
                        }}
                      >
                        {ACTIONS.wantedButUnavailable} {capability!.detail}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <CharCountField
        id="escalation-behavior"
        label={ACTIONS.escalationLabel}
        value={prompt.escalationRules}
        onChange={(v) => setPrompt({ escalationRules: v })}
        maxLength={800}
        rows={3}
        placeholder={ACTIONS.escalationPlaceholder}
        helpText={ACTIONS.escalationHelp}
      />
    </>
  );
}

/** Default export, matching the other section components. */
export default ActionsTab;
