import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "wouter";
import { Bot, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { BuilderNotice } from "@/components/common/BuilderNotice";
import { PublishButton } from "@/components/common/PublishButton";
import { useToast } from "@/hooks/use-toast";
import { useCreateAssistant } from "@/hooks/useAssistants";
import { useWorkspaceBusinessInfo } from "@/hooks/useWorkspaceBusinessInfo";
import { AssistantApiRequestError } from "@/lib/assistantsApi";
import { serializeDraftToConfig, findTemplateByKey, isValidTemplateKey } from "@/lib/assistantConfig";
import { useLocalAssistantDraft } from "@/hooks/useAssistantDrafts";
import { BuilderShell, resolveBuilderTab, type BuilderTabKey } from "@/pages/assistant-builder/BuilderShell";
import { DEFAULT_BUILDER_TAB } from "@/pages/assistants/assistantsContract";
import { voicePlatformEnabled, voicePublishEnabled } from "@/lib/featureFlags";

/**
 * AR-001J final refinement, owner decision B: a build that cannot publish
 * renders no Publish control here either -- not a disabled one explaining a
 * capability this build does not have. Foldable, so the control and its copy
 * leave the build with it. When publishing is on, the control is exactly the
 * one AR-001I shipped: never eligible on an unsaved assistant, and saying so.
 */
const publishInBuild = voicePlatformEnabled && voicePublishEnabled;

function ExpiredPreview() {
  return (
    <div className="flex h-full flex-col bg-background">
      <EmptyState
        icon={Bot}
        title="This builder preview has expired"
        description="Configuration in the assistant builder isn't saved yet, so it doesn't survive a reload. Start again from a template."
        action={
          <Link href="/assistants/new">
            <Button className="h-9 text-sm">Choose a template</Button>
          </Link>
        }
        className="flex-1"
      />
    </div>
  );
}

/** Milestone 1 / Checkpoint E2: unsaved builder for a not-yet-persisted assistant. */
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
      statusBadge={createMutation.isPending ? "Saving…" : "Not Saved"}
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
        <div className="flex flex-col items-end gap-1.5">
          {saveError && (
            <p role="alert" className="max-w-xs text-right text-[11px] text-destructive">
              {saveError}
            </p>
          )}
          <Button
            onClick={handleSave}
            disabled={!isNameValid || createMutation.isPending}
            className="h-9 gap-1.5 text-sm"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {createMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    />
  );
}
