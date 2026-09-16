import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "wouter";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuilderNotice } from "@/components/common/BuilderNotice";
import { PublishButton } from "@/components/common/PublishButton";
import { useToast } from "@/hooks/use-toast";
import { useCreateAssistant } from "@/hooks/useAssistants";
import { useWorkspaceBusinessInfo } from "@/hooks/useWorkspaceBusinessInfo";
import { AssistantApiRequestError } from "@/lib/assistantsApi";
import { serializeDraftToConfig, findTemplateByKey, isValidTemplateKey } from "@/lib/assistantConfig";
import { useLocalAssistantDraft } from "@/hooks/useAssistantDrafts";
import { BuilderShell, resolveBuilderTab, type BuilderTabKey } from "@/pages/assistant-builder/BuilderShell";
import { DEFAULT_BUILDER_TAB, SAVE } from "@/pages/assistants/assistantsContract";
import { voicePlatformEnabled, voicePublishEnabled } from "@/lib/featureFlags";
import "@/styles/v2-dashboard.css";

/**
 * A build that cannot publish renders no Publish control here either — not a
 * disabled one explaining a capability this build does not have. Foldable, so
 * the control and its copy leave the build with it. When publishing is on, the
 * control is never eligible on an unsaved assistant, and says so.
 */
const publishInBuild = voicePlatformEnabled && voicePublishEnabled;

function ExpiredPreview() {
  return (
    <div className="sd-page sd-enter">
      <div className="sd-empty">
        <h1 className="sd-empty__title">This builder preview has expired</h1>
        <p className="sd-empty__detail">
          Nothing in the assistant builder is saved until you choose Save changes, so it doesn&rsquo;t survive a
          reload. Start again from a template.
        </p>
        <p style={{ marginTop: "var(--sd-space-4, 1rem)" }}>
          <Link href="/assistants/new" className="sd-step__action">
            Choose a template
          </Link>
        </p>
      </div>
    </div>
  );
}

/** The unsaved builder, for an assistant that has not been persisted yet. */
export default function AssistantBuilderNew() {
  const params = useParams<{ tab?: string }>();
  const [searchParams] = useSearchParams();
  const templateKey = searchParams.get("templateKey");

  if (!isValidTemplateKey(templateKey)) {
    return <ExpiredPreview />;
  }

  return <NewAssistantBuilder templateKey={templateKey} tabParam={params.tab} />;
}

function NewAssistantBuilder({ templateKey, tabParam }: { templateKey: string; tabParam?: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const template = findTemplateByKey(templateKey)!;
  const { draft, update } = useLocalAssistantDraft(template);
  const createMutation = useCreateAssistant();
  const [saveError, setSaveError] = useState<string | null>(null);

  const tab: BuilderTabKey = resolveBuilderTab(tabParam) ?? DEFAULT_BUILDER_TAB;
  const goToTab = (t: BuilderTabKey) => navigate(`/assistants/new/${t}?templateKey=${encodeURIComponent(templateKey)}`);

  const isNameValid = draft.setup.assistantName.trim().length > 0 && draft.setup.assistantName.trim().length <= 100;
  const businessInfo = useWorkspaceBusinessInfo();

  const handleSave = () => {
    if (!isNameValid || createMutation.isPending) return;
    setSaveError(null);
    createMutation.mutate(
      {
        name: draft.setup.assistantName.trim(),
        templateKey,
        config: serializeDraftToConfig(draft, businessInfo.data ?? undefined),
      },
      {
        onSuccess: (assistant) => {
          toast({ title: "Draft saved", description: `"${assistant.name}" was created.` });
          navigate(`/assistants/${assistant.id}/${tab}`, { replace: true });
        },
        onError: (err) => {
          const message = err instanceof AssistantApiRequestError ? err.message : "Save failed. Please try again.";
          setSaveError(message);
          toast({ title: "Save failed", description: message, variant: "destructive" });
        },
      },
    );
  };

  const announcement = createMutation.isPending
    ? "Saving…"
    : saveError
      ? `Save failed: ${saveError}. Not saved.`
      : "Not saved";

  return (
    <BuilderShell
      draft={draft}
      update={update}
      tab={tab}
      onTabChange={goToTab}
      backHref="/assistants"
      statusBadge={createMutation.isPending ? "Saving…" : "Not saved"}
      announcement={announcement}
      headerBanner={<BuilderNotice />}
      publishControl={
        publishInBuild ? (
          <PublishButton
            eligible={false}
            pending={false}
            disabledReason="Save this assistant as a draft before publishing."
            onClick={() => {}}
          />
        ) : undefined
      }
      footerRight={
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--sd-space-3, .75rem)",
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "var(--sd-text-small, .8125rem)",
                color: "var(--sd-text-muted, #3b5265)",
              }}
            >
              {createMutation.isPending ? SAVE.saving : "Not saved yet"}
            </p>
            {!isNameValid && (
              <p
                style={{
                  margin: "var(--sd-space-1, .25rem) 0 0",
                  fontSize: "var(--sd-text-small, .8125rem)",
                  color: "var(--sd-text-muted, #3b5265)",
                }}
              >
                Give this assistant a name before saving it.
              </p>
            )}
            {saveError && (
              <p
                role="alert"
                style={{
                  margin: "var(--sd-space-1, .25rem) 0 0",
                  fontSize: "var(--sd-text-small, .8125rem)",
                  lineHeight: 1.5,
                  color: "var(--sd-danger, #9c2233)",
                }}
              >
                <strong>{SAVE.failedTitle}</strong> {saveError}
              </p>
            )}
          </div>
          <Button onClick={handleSave} disabled={!isNameValid || createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {createMutation.isPending ? SAVE.saving : SAVE.save}
          </Button>
        </div>
      }
    />
  );
}
