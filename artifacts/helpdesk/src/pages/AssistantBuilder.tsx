import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Bot, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineError } from "@/components/common/InlineError";
import { SkeletonCard } from "@/components/common/Skeletons";
import { useToast } from "@/hooks/use-toast";
import { useAssistantDetail, useUpdateAssistant } from "@/hooks/useAssistants";
import { AssistantApiRequestError } from "@/lib/assistantsApi";
import { serializeDraftToConfig, hydrateConfigToDraft } from "@/lib/assistantConfig";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";
import { BuilderShell, isBuilderTabKey, type BuilderTabKey } from "@/pages/assistant-builder/BuilderShell";

export type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

const ROUTE_ID_PATTERN = /^[1-9]\d*$/;

function BuilderDetailSkeleton() {
  return (
    <div className="flex h-full flex-col bg-background" aria-hidden="true">
      <div className="flex-shrink-0 border-b border-border px-6 py-4">
        <SkeletonCard className="h-4 w-24" />
        <SkeletonCard className="mt-3 h-8 w-64" />
      </div>
      <div className="flex-1 p-6">
        <SkeletonCard className="h-full" />
      </div>
    </div>
  );
}

function draftKey(draft: Pick<AssistantDraft, "setup" | "prompt" | "voiceModel" | "analysis" | "advanced">, name: string): string {
  return JSON.stringify({ name, config: serializeDraftToConfig(draft as AssistantDraft) });
}

export default function AssistantBuilder() {
  const params = useParams<{ id: string; tab?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const rawId = params.id;
  const isValidId = ROUTE_ID_PATTERN.test(rawId ?? "");
  const numericId = isValidId ? Number(rawId) : undefined;
  const tab: BuilderTabKey = isBuilderTabKey(params.tab) ? params.tab : "setup";

  const { data: assistant, isLoading, isError, error, refetch } = useAssistantDetail(numericId);
  const updateMutation = useUpdateAssistant(numericId ?? -1);

  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [baseline, setBaseline] = useState<{ name: string; draft: AssistantDraft } | null>(null);
  const [hydrationWarning, setHydrationWarning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hydratedIdRef = useRef<number | null>(null);
  const announcedErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params.tab && numericId !== undefined) {
      navigate(`/assistants/${numericId}/setup`, { replace: true });
    }
  }, [params.tab, numericId, navigate]);

  useEffect(() => {
    if (!assistant) return;
    if (hydratedIdRef.current === assistant.id) return;
    const { draft: hydrated, hadHydrationError } = hydrateConfigToDraft(
      assistant.config,
      assistant.templateKey,
      assistant.name,
    );
    setDraft(hydrated);
    setBaseline({ name: assistant.name, draft: hydrated });
    setHydrationWarning(hadHydrationError);
    setSaveError(null);
    hydratedIdRef.current = assistant.id;
  }, [assistant]);

  // Full reload of an unsaved builder never happens here — this route is
  // only reachable with a persisted numeric id, so a browser reload simply
  // re-fetches GET /:id above.
  useEffect(() => {
    if (!draft || !baseline) return;
    const dirty = draftKey(draft, draft.setup.assistantName) !== draftKey(baseline.draft, baseline.name);
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft, baseline]);

  const isDirty = useMemo(() => {
    if (!draft || !baseline) return false;
    return draftKey(draft, draft.setup.assistantName) !== draftKey(baseline.draft, baseline.name);
  }, [draft, baseline]);

  const isNameValid = !!draft && draft.setup.assistantName.trim().length > 0 && draft.setup.assistantName.trim().length <= 100;

  const update = (updater: (d: AssistantDraft) => AssistantDraft) => {
    setDraft((prev) => (prev ? updater(prev) : prev));
  };

  const handleSave = () => {
    if (!draft || !numericId || !isDirty || !isNameValid || updateMutation.isPending) return;
    setSaveError(null);
    updateMutation.mutate(
      {
        name: draft.setup.assistantName.trim(),
        config: serializeDraftToConfig(draft),
      },
      {
        onSuccess: (updated) => {
          const { draft: hydrated } = hydrateConfigToDraft(updated.config, updated.templateKey, updated.name);
          setDraft(hydrated);
          setBaseline({ name: updated.name, draft: hydrated });
          hydratedIdRef.current = updated.id;
          announcedErrorRef.current = null;
          toast({ title: "Saved", description: `"${updated.name}" was saved.` });
        },
        onError: (err) => {
          const message = err instanceof AssistantApiRequestError ? err.message : "Save failed. Please try again.";
          setSaveError(message);
          if (announcedErrorRef.current !== message) {
            announcedErrorRef.current = message;
            toast({ title: "Save failed", description: message, variant: "destructive" });
          }
        },
      },
    );
  };

  if (!isValidId) {
    return (
      <div className="flex h-full flex-col bg-background">
        <EmptyState
          icon={Bot}
          title="Invalid assistant link"
          description="This assistant link isn't valid. Go back to your assistants list."
          action={
            <Link href="/assistants">
              <Button className="h-9 text-sm">Back to Assistants</Button>
            </Link>
          }
          className="flex-1"
        />
      </div>
    );
  }

  if (isLoading) {
    return <BuilderDetailSkeleton />;
  }

  if (isError) {
    const status = error instanceof AssistantApiRequestError ? error.status : undefined;
    if (status === 404) {
      return (
        <div className="flex h-full flex-col bg-background">
          <EmptyState
            icon={Bot}
            title="Assistant not found"
            description="This assistant doesn't exist, or you don't have access to it."
            action={
              <Link href="/assistants">
                <Button className="h-9 text-sm">Back to Assistants</Button>
              </Link>
            }
            className="flex-1"
          />
        </div>
      );
    }
    const message = error instanceof AssistantApiRequestError ? error.message : undefined;
    return (
      <div className="flex h-full flex-col bg-background">
        <InlineError
          title="Couldn't load this assistant"
          description={message}
          onRetry={() => refetch()}
          className="flex-1"
        />
      </div>
    );
  }

  if (!assistant || !draft) {
    return <BuilderDetailSkeleton />;
  }

  const isEligibleForDelete = assistant.status === "draft" && !assistant.provider && !assistant.providerAssistantId;

  let statusLabel: string;
  if (updateMutation.isPending) statusLabel = "Saving…";
  else if (isDirty) statusLabel = "Unsaved changes";
  else statusLabel = `${assistant.status === "draft" ? "Draft" : assistant.status === "published" ? "Published" : "Error"} · Saved`;

  const announcement = updateMutation.isPending
    ? "Saving…"
    : saveError
      ? `Save failed: ${saveError}. Unsaved changes remain.`
      : isDirty
        ? "Unsaved changes"
        : "Saved";

  return (
    <BuilderShell
      draft={draft}
      update={update}
      tab={tab}
      onTabChange={(t) => navigate(`/assistants/${numericId}/${t}`)}
      backHref="/assistants"
      statusBadge={statusLabel}
      announcement={announcement}
      headerBanner={
        <>
          {hydrationWarning && (
            <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning-foreground dark:text-warning">
              This assistant's saved configuration couldn't be fully read, so defaults are shown here. Saving will
              replace it with the values currently in the builder.
            </div>
          )}
          {assistant.status === "error" && assistant.syncError && (
            <div role="status" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              <span className="font-semibold">Sync error:</span> {assistant.syncError}
            </div>
          )}
          {!isEligibleForDelete && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {assistant.provider && assistant.providerAssistantId
                ? "Connected to a voice provider."
                : "Not connected."}
              {" "}Assigned phone number: Available after Phone Numbers setup.
            </p>
          )}
        </>
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
            disabled={!isDirty || !isNameValid || updateMutation.isPending}
            className="h-9 gap-1.5 text-sm"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {updateMutation.isPending ? "Saving…" : "Save Draft"}
          </Button>
        </div>
      }
    />
  );
}
