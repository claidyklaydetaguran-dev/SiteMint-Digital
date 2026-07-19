import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Bot, Save, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineError } from "@/components/common/InlineError";
import { SkeletonCard } from "@/components/common/Skeletons";
import { PublishButton } from "@/components/common/PublishButton";
import { PublishConfirmDialog } from "@/components/common/PublishConfirmDialog";
import { BrowserTestButton } from "@/components/common/BrowserTestButton";
import { BrowserTestConfirmDialog } from "@/components/common/BrowserTestConfirmDialog";
import { BrowserTestPanel } from "@/components/common/BrowserTestPanel";
import { useToast } from "@/hooks/use-toast";
import { useAssistantDetail, useUpdateAssistant, usePublishAssistant } from "@/hooks/useAssistants";
import { useBrowserVoiceTest } from "@/hooks/useBrowserVoiceTest";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { AssistantApiRequestError } from "@/lib/assistantsApi";
import { serializeDraftToConfig, hydrateConfigToDraft } from "@/lib/assistantConfig";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";
import { BuilderShell, isBuilderTabKey, type BuilderTabKey } from "@/pages/assistant-builder/BuilderShell";
import { voicePlatformEnabled, voicePublishEnabled } from "@/lib/featureFlags";
import { STATUS_LABEL, isEligibleForDelete, isPublishableStatus } from "@/lib/assistantStatus";
import { publishRouteErrorMessage, safeSyncErrorMessage } from "@/lib/publishErrors";
import { browserTestDisabledReason } from "@/lib/browserVoice/eligibility";

export type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

const ROUTE_ID_PATTERN = /^[1-9]\d*$/;
const PUBLISHING_POLL_INTERVAL_MS = 4000;

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

function formatSyncedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatProviderName(provider: string | null): string {
  if (!provider) return "the voice provider";
  return provider.length > 0 ? provider[0].toUpperCase() + provider.slice(1) : provider;
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
  const publishMutation = usePublishAssistant(numericId);

  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [baseline, setBaseline] = useState<{ name: string; draft: AssistantDraft } | null>(null);
  const [hydrationWarning, setHydrationWarning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishBanner, setPublishBanner] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const hydratedIdRef = useRef<number | null>(null);
  const announcedErrorRef = useRef<string | null>(null);
  const publishButtonRef = useRef<HTMLButtonElement | null>(null);
  const testButtonRef = useRef<HTMLButtonElement | null>(null);
  const publishInFlightRef = useRef(false);
  const testInFlightRef = useRef(false);

  const firmId = useAuthenticatedFirmId();
  const browserTest = useBrowserVoiceTest();

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

  // Milestone 1 / Checkpoint E3C: warn on unload while a publish request is
  // still in flight — leaving the page must never be presented as safely
  // cancelling a publish attempt that may still complete server-side.
  useEffect(() => {
    if (!publishMutation.isPending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [publishMutation.isPending]);

  // Milestone 1 / Checkpoint F1: warn on unload while a browser test is
  // active, and make a best-effort client teardown on pagehide (which fires
  // more reliably than beforeunload on mobile browsers/tab discard).
  // Neither promises the provider side actually terminates.
  useEffect(() => {
    if (!browserTest.isActive) return;
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const pagehideHandler = () => {
      browserTest.bestEffortUnloadCleanup();
    };
    window.addEventListener("beforeunload", beforeUnloadHandler);
    window.addEventListener("pagehide", pagehideHandler);
    return () => {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      window.removeEventListener("pagehide", pagehideHandler);
    };
  }, [browserTest.isActive, browserTest.bestEffortUnloadCleanup]);

  // Milestone 1 / Checkpoint F1: tenant/session safety. A browser test tied
  // to one firm/assistant/provider identity must never remain active (or
  // show its panel) once any of those change underneath the component —
  // reset (not dismiss) forces an immediate client teardown regardless of
  // the current state.
  const resetBrowserTestRef = useRef(browserTest.reset);
  resetBrowserTestRef.current = browserTest.reset;
  const tenantResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${firmId ?? "unresolved"}:${numericId ?? "none"}:${assistant?.providerAssistantId ?? "none"}:${assistant?.status ?? "none"}`;
    if (tenantResetKeyRef.current === null) {
      tenantResetKeyRef.current = key;
      return;
    }
    if (tenantResetKeyRef.current === key) return;
    tenantResetKeyRef.current = key;
    resetBrowserTestRef.current();
  }, [firmId, numericId, assistant?.providerAssistantId, assistant?.status]);

  // Milestone 1 / Checkpoint E3C: while the server-confirmed status is
  // "publishing", poll the ordinary GET detail endpoint (never the publish
  // endpoint) so a customer watching this page sees the outcome without a
  // manual refresh. Stops the moment status is no longer "publishing".
  useEffect(() => {
    if (!assistant || assistant.status !== "publishing") return;
    const intervalId = window.setInterval(() => {
      refetch();
    }, PUBLISHING_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [assistant?.status, refetch]);

  const isDirty = useMemo(() => {
    if (!draft || !baseline) return false;
    return draftKey(draft, draft.setup.assistantName) !== draftKey(baseline.draft, baseline.name);
  }, [draft, baseline]);

  const isNameValid = !!draft && draft.setup.assistantName.trim().length > 0 && draft.setup.assistantName.trim().length <= 100;

  const update = (updater: (d: AssistantDraft) => AssistantDraft) => {
    setDraft((prev) => (prev ? updater(prev) : prev));
  };

  const handleSave = () => {
    if (!draft || !numericId || !isDirty || !isNameValid || updateMutation.isPending || publishMutation.isPending) return;
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

  const restoreFocusToPublishButton = () => {
    requestAnimationFrame(() => publishButtonRef.current?.focus());
  };

  const publishEligible =
    voicePlatformEnabled &&
    voicePublishEnabled &&
    !!assistant &&
    !!numericId &&
    !isDirty &&
    isNameValid &&
    !updateMutation.isPending &&
    !publishMutation.isPending &&
    !browserTest.isActive &&
    isPublishableStatus(assistant.status) &&
    !assistant.provider &&
    !assistant.providerAssistantId;

  function publishDisabledReason(): string | undefined {
    if (!voicePublishEnabled) return "Publishing is not enabled in this environment.";
    if (!assistant || !draft) return undefined;
    if (!numericId) return "Save this assistant as a draft before publishing.";
    if (isDirty) return "Save your changes before publishing.";
    if (!isNameValid) return "Enter a valid assistant name before publishing.";
    if (updateMutation.isPending) return "Saving is in progress. Publish will be available once saving finishes.";
    if (publishMutation.isPending) return "Publishing is already in progress.";
    if (assistant.status === "publishing") return "Publishing is already in progress.";
    if (assistant.status === "published") return "This assistant has already been published.";
    if (assistant.status === "publish_uncertain")
      return "Publishing could not be confirmed for this assistant. Contact support before taking another action.";
    if (assistant.status === "unknown") return "This assistant's status could not be determined.";
    if (assistant.provider || assistant.providerAssistantId)
      return "This assistant is already connected to a voice provider.";
    return "Publishing is not available right now.";
  }

  const openPublishDialog = () => {
    if (!publishEligible || publishMutation.isPending) return;
    setPublishBanner(null);
    setPublishDialogOpen(true);
  };

  const cancelPublishDialog = () => {
    if (publishMutation.isPending) return;
    setPublishDialogOpen(false);
    restoreFocusToPublishButton();
  };

  const confirmPublish = () => {
    // `publishMutation.isPending` only flips after React commits the mutation's
    // internal state update, so two clicks arriving in the same tick (a fast
    // double-click, or a click event that fires again before re-render) can
    // both read `isPending` as still false. `publishInFlightRef` is a plain
    // mutable ref, set synchronously here, so it closes that race — this is
    // the only thing standing between "one confirm click" and two POSTs.
    if (publishInFlightRef.current || publishMutation.isPending) return;
    publishInFlightRef.current = true;
    publishMutation.mutate(undefined, {
      onSuccess: () => {
        setPublishBanner(null);
        setPublishDialogOpen(false);
        restoreFocusToPublishButton();
        toast({ title: "Assistant published", description: `"${draft?.setup.assistantName ?? "Assistant"}" was published.` });
      },
      onError: (err) => {
        setPublishDialogOpen(false);
        restoreFocusToPublishButton();
        const apiErr = err instanceof AssistantApiRequestError ? err : undefined;
        const code = apiErr?.code;
        // already_published / publish_in_progress / assistant_not_found resolve
        // themselves once the detail refetch (triggered by the mutation's
        // onSettled) lands — no separate transient banner needed for those.
        if (code === "already_published" || code === "publish_in_progress" || code === "assistant_not_found") {
          return;
        }
        const message = publishRouteErrorMessage(code, apiErr?.message ?? "Something went wrong while publishing. Please try again.");
        setPublishBanner(message);
      },
      onSettled: () => {
        publishInFlightRef.current = false;
      },
    });
  };

  const restoreFocusToTestButton = () => {
    requestAnimationFrame(() => testButtonRef.current?.focus());
  };

  const testDisabledReason = assistant
    ? browserTestDisabledReason({
        assistant,
        isDirty,
        savePending: updateMutation.isPending,
        publishPending: publishMutation.isPending,
        clientAvailable: browserTest.clientAvailable,
        testActive: browserTest.isActive,
      })
    : "Save and publish this assistant before testing.";
  const testEligible = voicePlatformEnabled && testDisabledReason === undefined;

  const openTestDialog = () => {
    if (!testEligible || browserTest.isActive) return;
    setTestDialogOpen(true);
  };

  const cancelTestDialog = () => {
    setTestDialogOpen(false);
    restoreFocusToTestButton();
  };

  const confirmTest = () => {
    // Mirrors confirmPublish's synchronous ref guard: rapid confirm clicks in
    // the same tick must still produce exactly one client.start() call.
    if (testInFlightRef.current || browserTest.isActive) return;
    if (!assistant?.providerAssistantId || assistant.provider !== "vapi") return;
    testInFlightRef.current = true;
    setTestDialogOpen(false);
    restoreFocusToTestButton();
    browserTest.start({ provider: "vapi", providerAssistantId: assistant.providerAssistantId });
    testInFlightRef.current = false;
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

  const deletable = isEligibleForDelete(assistant);
  const syncedAtDisplay = formatSyncedAt(assistant.lastSyncedAt);

  let statusLabel: string;
  if (publishMutation.isPending) statusLabel = "Publishing…";
  else if (updateMutation.isPending) statusLabel = "Saving…";
  else if (isDirty) statusLabel = "Unsaved changes";
  else statusLabel = `${STATUS_LABEL[assistant.status]} · Saved`;

  const announcement = publishMutation.isPending
    ? "Publishing is in progress. Do not submit again."
    : assistant.status === "publish_uncertain"
      ? "Publishing could not be confirmed. Do not publish again. Contact support before taking another action."
      : assistant.status === "publishing"
        ? "Publishing is already in progress."
        : publishBanner
          ? `Publish failed: ${publishBanner}`
          : updateMutation.isPending
            ? "Saving…"
            : saveError
              ? `Save failed: ${saveError}. Unsaved changes remain.`
              : isDirty
                ? "Unsaved changes"
                : assistant.status === "published"
                  ? "Assistant published"
                  : "Saved";

  const saveDisabled =
    !isDirty ||
    !isNameValid ||
    updateMutation.isPending ||
    publishMutation.isPending ||
    browserTest.isActive ||
    assistant.status === "publishing";

  return (
    <>
      <BuilderShell
        draft={draft}
        update={update}
        tab={tab}
        onTabChange={(t) => navigate(`/assistants/${numericId}/${t}`)}
        backHref="/assistants"
        statusBadge={statusLabel}
        announcement={announcement}
        contentDisabled={publishMutation.isPending || browserTest.isActive}
        publishControl={
          <PublishButton
            ref={publishButtonRef}
            eligible={publishEligible}
            pending={publishMutation.isPending}
            disabledReason={publishDisabledReason()}
            onClick={openPublishDialog}
          />
        }
        testControl={
          <BrowserTestButton
            ref={testButtonRef}
            eligible={testEligible}
            active={browserTest.isActive}
            disabledReason={testDisabledReason}
            onClick={openTestDialog}
          />
        }
        testPanel={
          <BrowserTestPanel
            state={browserTest.state}
            assistantName={draft.setup.assistantName || "Untitled assistant"}
            elapsedSeconds={browserTest.elapsedSeconds}
            errorMessage={browserTest.errorMessage}
            onEnd={browserTest.end}
            onDismiss={browserTest.dismiss}
          />
        }
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
                <span className="font-semibold">Publish failed:</span> {safeSyncErrorMessage(assistant.syncError)}
              </div>
            )}
            {assistant.status === "publish_uncertain" && (
              <div
                role="alert"
                className="mt-2 rounded-lg border-2 border-warning bg-warning/15 px-3.5 py-2.5 text-xs font-medium text-warning-foreground dark:text-warning"
              >
                Publishing could not be confirmed. Do not publish again. Contact support before taking another action.
              </div>
            )}
            {assistant.status === "publishing" && (
              <div role="status" className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/10 px-3.5 py-2.5 text-xs text-info">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Publishing is already in progress.
                </span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-info underline-offset-2 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Refresh status
                </button>
              </div>
            )}
            {publishBanner && assistant.status !== "error" && assistant.status !== "publish_uncertain" && (
              <div role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                {publishBanner}
              </div>
            )}
            {assistant.status === "published" ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Connected to {formatProviderName(assistant.provider)}.
                {syncedAtDisplay ? ` Last synced ${syncedAtDisplay}.` : ""}
                {" "}Assigned phone number: Available after Phone Numbers setup.
              </p>
            ) : (
              !deletable && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Not connected. Assigned phone number: Available after Phone Numbers setup.
                </p>
              )
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
            {isDirty && assistant.status !== "publishing" && (
              <p className="max-w-xs text-right text-[11px] text-muted-foreground">
                Save your changes before publishing.
              </p>
            )}
            <Button onClick={handleSave} disabled={saveDisabled} className="h-9 gap-1.5 text-sm">
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
      <PublishConfirmDialog
        open={publishDialogOpen}
        assistantName={draft.setup.assistantName || "Untitled assistant"}
        statusLabel={STATUS_LABEL[assistant.status]}
        pending={publishMutation.isPending}
        onCancel={cancelPublishDialog}
        onConfirm={confirmPublish}
      />
      <BrowserTestConfirmDialog
        open={testDialogOpen}
        assistantName={draft.setup.assistantName || "Untitled assistant"}
        onCancel={cancelTestDialog}
        onConfirm={confirmTest}
      />
    </>
  );
}
