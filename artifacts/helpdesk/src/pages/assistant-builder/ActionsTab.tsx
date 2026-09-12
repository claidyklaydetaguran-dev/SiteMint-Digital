/**
 * V8 — "What it can do": the actions the assistant may take on a call.
 *
 * Two different questions live on this screen, and the whole point is that they
 * are not merged:
 *
 *   WHAT YOU WANT IT TO DO — the checkboxes. Part of the assistant draft, saved
 *     with everything else, and entirely under the customer's control.
 *   WHAT IT CAN ACTUALLY DO — the capability cards. Derived by the server from
 *     the published payload's own rules, and not editable here.
 *
 * Before this screen existed, only the first was shown. A customer could tick
 * "Book appointments", save, publish, and reasonably believe callers could book
 * — while the published assistant carried no booking tool at all. Now a ticked
 * action whose capability is unavailable says so, next to the tick, with the
 * specific thing that would unblock it.
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
};

function CapabilityCard({ capability }: { capability: AssistantCapability }) {
  const active = capability.state === "active";
  const link = capability.blockedBy ? BLOCKER_LINK[capability.blockedBy] : undefined;
  return (
    <li className="rounded-lg border border-card-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        {active ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {capability.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {active ? ACTIONS.stateActive : ACTIONS.stateUnavailable}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{capability.detail}</p>
          {link && (
            <Link href={link.href} className="mt-1 inline-block text-xs text-primary hover:underline">
              {link.label} &rarr;
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
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-foreground">{ACTIONS.availableTitle}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{ACTIONS.availableDetail}</p>

        {capabilities.isLoading && (
          <p className="mt-2 text-xs text-muted-foreground">{ACTIONS.loading}</p>
        )}
        {capabilities.isError && (
          <p className="mt-2 text-xs text-destructive" role="alert">{ACTIONS.loadFailed}</p>
        )}
        {!capabilities.isLoading && !capabilities.isError && (
          <>
            {capabilities.data && !capabilities.data.toolsAttachable && (
              <p className="mt-2 rounded-md border border-card-border bg-background p-2.5 text-xs text-muted-foreground">
                {ACTIONS.noneAttachable}
              </p>
            )}
            <ul className="mt-2 space-y-2">
              {items.map((c) => (
                <CapabilityCard key={c.key} capability={c} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">{ACTIONS.permittedTitle}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{ACTIONS.permittedDetail}</p>
        <div className="mt-2 space-y-2.5">
          {PERMITTED_ACTIONS.map((action) => {
            const checked = tools.permittedActions.includes(action.id);
            const inputId = `permitted-action-${action.id}`;
            const capability = capabilityFor(action.id);
            // Only worth flagging when the customer has asked for something the
            // assistant cannot currently do. An unticked action needs no notice.
            const unavailable = checked && capability !== undefined && capability.state !== "active";
            return (
              <label
                key={action.id}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-3 hover-elevate"
              >
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(v) => togglePermittedAction(action.id, v === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                  {unavailable && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <AlertTriangle className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden="true" />
                      {ACTIONS.wantedButUnavailable} {capability!.detail}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
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
    </div>
  );
}

/** Default export, matching the other section components. */
export default ActionsTab;
