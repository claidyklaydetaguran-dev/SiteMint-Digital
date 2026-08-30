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
import { SyncAssistantButton, SyncConfirmDialog } from "@/components/common/SyncAssistantControls";
import { useToast } from "@/hooks/use-toast";
import { useAssistantDetail, useUpdateAssistant, usePublishAssistant, useSyncAssistant } from "@/hooks/useAssistants";
import { useBrowserVoiceTest, type UseBrowserVoiceTestResult } from "@/hooks/useBrowserVoiceTest";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { AssistantApiRequestError, normalizeSyncRouteErrorCode, fetchBrowserTestSession } from "@/lib/assistantsApi";
import { serializeDraftToConfig, hydrateConfigToDraft } from "@/lib/assistantConfig";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";
import { BuilderShell, isBuilderTabKey, type BuilderTabKey } from "@/pages/assistant-builder/BuilderShell";
import { voicePlatformEnabled, voicePublishEnabled, voiceBrowserTestEnabled, voiceSyncEnabled } from "@/lib/featureFlags";
import { STATUS_LABEL, isEligibleForDelete, isPublishableStatus } from "@/lib/assistantStatus";
import { publishRouteErrorMessage, safeSyncErrorMessage } from "@/lib/publishErrors";
import { browserTestDisabledReason } from "@/lib/browserVoice/eligibility";
import {
  BUILDER,
  PRESET_RECOVERY,
  SAVE_PROMPT_EITHER,
  SAVE_PROMPT_PUBLISH,
  SAVE_PROMPT_TEST,
  assistantHref,
  isSupportedVoicePreset,
  lastSyncedNote,
} from "@/pages/assistants/assistantsContract";

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

/**
 * AR-001I removed `formatProviderName`. It rendered the vendor's own name
 * into the customer's banner, which is an internal provider identifier the
 * customer has no action to take on. The two banner sentences it appeared in
 * also each ended with a fixed "Assigned phone number: Available after Phone
 * Numbers setup." — a claim no response supplied and no endpoint supports.
 * Both sentences now come from the contract module and say only what the
 * `provider`/`providerAssistantId` pair actually proves: whether a
 * provider-side assistant exists.
 */

/**
 * -- AR-001J final refinement, owner decision B --------------------------
 *
 * Publishing and browser testing are subordinate to the platform flag, and
 * a build without either shows nothing for it: no control, no dialog, no
 * unavailable-explanation, and none of the code behind them. Both constants
 * are compositions of the foldable flag constants in `lib/featureFlags.ts`,
 * so Rollup resolves each to a literal and removes every branch it does not
 * select -- the control, its confirmation dialog, its copy, and (for the
 * browser test) the whole voice-client seam that used to reach the provider
 * SDK.
 *
 * Neither constant is a security boundary. The backend keeps its own
 * `publish_disabled` authority, the provider client keeps its own
 * fail-closed checks, and the status this page reports still comes from the
 * server. Assistant setup, prompt, voice/model configuration, saving, status
 * and provider-link information are untouched by both.
 */
const publishInBuild = voicePlatformEnabled && voicePublishEnabled;
const browserTestInBuild = voicePlatformEnabled && voiceBrowserTestEnabled;
/**
 * AR-001V.1: synchronization is its own capability with its own flag —
 * independent of publishing, subordinate to the platform flag, and folded to
 * a literal so a disabled build drops the control, its dialog, its mutation
 * hook and its copy entirely.
 */
const syncInBuild = voicePlatformEnabled && voiceSyncEnabled;

/** Static, provider-free message. A failed session fetch never shows a response body. */
const BROWSER_TEST_SESSION_ERROR =
  "Couldn't start the browser test. Please try again.";

/**
 * -- AR-001J owner review, correction B: a truthful unsaved-changes prompt --
 *
 * The dirty-draft hint beside Save Draft used to be a fixed sentence naming
 * publishing. It is not a publish control, so the build boundary above left
 * it in place, and a build with publishing disabled rendered -- and shipped
 * -- guidance about an action it cannot perform.
 *
 * Saving is the precondition of both subordinate actions, so the sentence
 * follows the same two constants that decide whether either action exists in
 * this build. The selection is a ternary over folded literals, so exactly one
 * string reaches the bundle: a publish-only build carries no testing wording,
 * a browser-test-only build carries no publishing wording, and a build with
 * neither carries no sentence at all and renders nothing in its place --
 * `null` removes the paragraph, it does not leave an empty one.
 *
 * `SAVE_PROMPT_EITHER` is the both-enabled wording and is deliberately
 * neutral; the reasoning is recorded beside the three sentences in
 * `pages/assistants/assistantsContract.ts`. Guidance naming the attempted
 * action is unchanged and still comes from each control's own disabled
 * reason.
 *
 * This decides wording only. Saving, publishing, browser testing, their
 * confirmations, their single-flight guards and every provider check behave
 * exactly as before, and nothing here issues a request or mutates anything.
 */
const unsavedChangesPrompt: string | null = publishInBuild
  ? browserTestInBuild
    ? SAVE_PROMPT_EITHER
    : SAVE_PROMPT_PUBLISH
  : browserTestInBuild
    ? SAVE_PROMPT_TEST
    : null;

/**
 * The builder always calls one browser-test hook and one publish hook, so
 * the hook order is fixed for any build. Which one it calls is decided here,
 * at module scope, by a constant -- so a build without the feature never
 * pulls in its state machine, its copy or its client at all, and a build
 * with it behaves exactly as AR-001I left it.
 */
const NO_BROWSER_TEST: UseBrowserVoiceTestResult = {
  state: "idle",
  errorMessage: null,
  elapsedSeconds: 0,
  clientAvailable: false,
  isActive: false,
  start: () => {},
  end: () => {},
  dismiss: () => {},
  reset: () => {},
  bestEffortUnloadCleanup: () => {},
};

function useNoBrowserVoiceTest(): UseBrowserVoiceTestResult {
  return NO_BROWSER_TEST;
}

const useBuilderBrowserTest: () => UseBrowserVoiceTestResult = browserTestInBuild
  ? useBrowserVoiceTest
  : useNoBrowserVoiceTest;

type BuilderPublishMutation = Pick<ReturnType<typeof usePublishAssistant>, "isPending" | "mutate">;

const NO_PUBLISH: BuilderPublishMutation = { isPending: false, mutate: () => {} };

/**
 * AR-001V.1: same fixed-hook-order technique for synchronization. A build with
 * `VITE_VOICE_SYNC_ENABLED` off calls the inert hook, so the real mutation, its
 * client function and its error copy never enter the graph.
 */
type BuilderSyncMutation = Pick<ReturnType<typeof useSyncAssistant>, "isPending" | "mutate">;

const NO_SYNC: BuilderSyncMutation = { isPending: false, mutate: () => {} };

function useNoSyncAssistant(): BuilderSyncMutation {
  return NO_SYNC;
}

const useBuilderSync: (id: number | undefined) => BuilderSyncMutation = syncInBuild
  ? useSyncAssistant
  : useNoSyncAssistant;

const useBuilderPublish: (id: number | undefined) => BuilderPublishMutation = publishInBuild
  ? usePublishAssistant
  : () => NO_PUBLISH;

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
  const publishMutation = useBuilderPublish(numericId);
  const syncMutation = useBuilderSync(numericId);

  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [baseline, setBaseline] = useState<{ name: string; draft: AssistantDraft } | null>(null);
  const [hydrationWarning, setHydrationWarning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishBanner, setPublishBanner] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [testSessionError, setTestSessionError] = useState<string | null>(null);
  const syncButtonRef = useRef<HTMLButtonElement | null>(null);
  const syncInFlightRef = useRef(false);
  const hydratedIdRef = useRef<number | null>(null);
  const announcedErrorRef = useRef<string | null>(null);
  const publishButtonRef = useRef<HTMLButtonElement | null>(null);
  const testButtonRef = useRef<HTMLButtonElement | null>(null);
  const publishInFlightRef = useRef(false);
  const testInFlightRef = useRef(false);

  const firmId = useAuthenticatedFirmId();
  const browserTest = useBuilderBrowserTest();

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
    const key = `${firmId ?? "unresolved"}:${numericId ?? "none"}:${assistant?.providerLinked ?? "none"}:${assistant?.status ?? "none"}`;
    if (tenantResetKeyRef.current === null) {
      tenantResetKeyRef.current = key;
      return;
    }
    if (tenantResetKeyRef.current === key) return;
    tenantResetKeyRef.current = key;
    resetBrowserTestRef.current();
  }, [firmId, numericId, assistant?.providerLinked, assistant?.status]);

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
    publishInBuild &&
    !!assistant &&
    !!numericId &&
    !!draft &&
    isSupportedVoicePreset(draft.voiceModel.preset) &&
    !isDirty &&
    isNameValid &&
    !updateMutation.isPending &&
    !publishMutation.isPending &&
    !browserTest.isActive &&
    isPublishableStatus(assistant.status) &&
    !assistant.provider &&
    !assistant.providerLinked;

  const publishDisabledReason: () => string | undefined = publishInBuild
    ? () => {
        if (!assistant || !draft) return undefined;
        if (!numericId) return "Save this assistant as a draft before publishing.";
        // The same sentence the dirty-draft hint uses when this build can
        // publish, by identity rather than by coincidence: this one is tied to
        // an attempted publish, and the two must never drift apart.
        if (isDirty) return SAVE_PROMPT_PUBLISH;
        if (!isNameValid) return "Enter a valid assistant name before publishing.";
        // Checked before the in-flight reasons so a retired preset is named as
        // the blocker rather than being hidden behind a transient one. The server
        // would reject it with `unsupported_preset` anyway; this only says so
        // before the customer spends a publish attempt on it.
        if (!isSupportedVoicePreset(draft.voiceModel.preset)) return PRESET_RECOVERY.publishBlocked;
        if (updateMutation.isPending) return "Saving is in progress. Publish will be available once saving finishes.";
        if (publishMutation.isPending) return "Publishing is already in progress.";
        if (assistant.status === "publishing") return "Publishing is already in progress.";
        if (assistant.status === "published") return "This assistant has already been published.";
        if (assistant.status === "publish_uncertain")
          return "Publishing could not be confirmed for this assistant. Contact support before taking another action.";
        if (assistant.status === "unknown") return "This assistant's status could not be determined.";
        if (assistant.provider || assistant.providerLinked)
          return "This assistant is already connected to a voice provider.";
        return "Publishing is not available right now.";
      }
    : () => undefined;

  // ── AR-001V: provider synchronization for an already-published assistant ──
  //
  // Eligibility is intentionally narrow, and every part of it is a fact the
  // server re-checks independently: the row must be published, linked to the
  // vapi provider with a confirmed provider id, have no unsaved local edits
  // (otherwise the payload sent would not be the one shown), and be in a state
  // that actually differs from what the provider confirmed.
  const syncDisabledReason: string | undefined = (() => {
    if (!assistant) return "Save this assistant before updating the voice provider.";
    if (assistant.status !== "published") return "Publish this assistant before updating the voice provider.";
    if (assistant.provider !== "vapi" || !assistant.providerLinked)
      return "This assistant has no confirmed provider connection to update.";
    if (isDirty) return "Save your changes before updating the voice provider.";
    if (updateMutation.isPending || publishMutation.isPending) return "Wait for the current action to finish.";
    if (browserTest.isActive) return "End the browser test before updating the voice provider.";
    if (assistant.providerSyncState === "synchronizing") return "An update is already in progress.";
    if (assistant.providerSyncState === "synchronized") return "The voice provider already has this configuration.";
    if (assistant.providerSyncState === "not_published")
      return "Publish this assistant before updating the voice provider.";
    return undefined;
  })();

  const syncEligible = syncDisabledReason === undefined;

  const restoreFocusToSyncButton = () => {
    syncButtonRef.current?.focus();
  };

  const openSyncDialog = () => {
    if (!syncEligible || syncMutation.isPending) return;
    setSyncBanner(null);
    setSyncDialogOpen(true);
  };

  const cancelSyncDialog = () => {
    if (syncMutation.isPending) return;
    setSyncDialogOpen(false);
    restoreFocusToSyncButton();
  };

  const confirmSync = () => {
    // Same reasoning as confirmPublish: `isPending` only flips after React
    // commits, so a synchronous ref is the only thing that makes two clicks in
    // one tick produce at most one provider update.
    if (syncInFlightRef.current || syncMutation.isPending) return;
    syncInFlightRef.current = true;
    syncMutation.mutate(undefined, {
      onSuccess: (result) => {
        setSyncBanner(null);
        setSyncDialogOpen(false);
        restoreFocusToSyncButton();
        toast({
          title: result.providerRequestSent ? "Voice provider updated" : "Already up to date",
          description: result.providerRequestSent
            ? "The voice provider is now running this configuration."
            : "The voice provider already had this configuration, so nothing was sent.",
        });
      },
      onError: (err) => {
        setSyncDialogOpen(false);
        restoreFocusToSyncButton();
        const apiErr = err instanceof AssistantApiRequestError ? err : undefined;
        // `AssistantApiRequestError.code` is typed against the publish
        // allowlist, so the sync codes are re-narrowed here rather than
        // widening that shared type.
        const code = normalizeSyncRouteErrorCode(apiErr?.code);
        // These two resolve themselves once the detail refetch triggered by
        // the mutation's onSettled lands — no transient banner needed.
        if (code === "sync_in_progress" || code === "assistant_not_found") return;
        setSyncBanner(
          apiErr?.message ?? "Something went wrong while updating the voice provider. Please try again.",
        );
      },
      onSettled: () => {
        syncInFlightRef.current = false;
      },
    });
  };

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

  const confirmPublish: () => void = publishInBuild
    ? () => {
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
      }
    : () => {};

  const restoreFocusToTestButton = () => {
    requestAnimationFrame(() => testButtonRef.current?.focus());
  };

  const testDisabledReason: string | undefined = browserTestInBuild
    ? assistant
      ? browserTestDisabledReason({
          assistant,
          isDirty,
          savePending: updateMutation.isPending,
          publishPending: publishMutation.isPending,
          clientAvailable: browserTest.clientAvailable,
          testActive: browserTest.isActive,
        })
      : "Save and publish this assistant before testing."
    : undefined;
  const testEligible = browserTestInBuild && testDisabledReason === undefined;

  const openTestDialog = () => {
    if (!testEligible || browserTest.isActive) return;
    setTestDialogOpen(true);
  };

  const cancelTestDialog = () => {
    setTestDialogOpen(false);
    restoreFocusToTestButton();
  };

  const confirmTest: () => void = browserTestInBuild
    ? () => {
        // Mirrors confirmPublish's synchronous ref guard: rapid confirm clicks in
        // the same tick must still produce exactly one client.start() call.
        if (testInFlightRef.current || browserTest.isActive) return;
        if (!assistant?.providerLinked || assistant.provider !== "vapi" || numericId === undefined) return;
        testInFlightRef.current = true;
        setTestDialogOpen(false);
        restoreFocusToTestButton();
        // AR-001V.1: the provider assistant id is no longer carried by the
        // assistant DTO. It is fetched here, from the dedicated endpoint,
        // only because the owner just confirmed this dialog — never on page
        // load, never on mount, never speculatively. The server checks its
        // own VOICE_BROWSER_TEST_ENABLED flag and the firm scope again, and
        // is authoritative; this call is the only place in the client that
        // ever holds the id, and it is passed straight to the client seam
        // without being stored in state, a query cache, or the URL.
        void fetchBrowserTestSession(numericId)
          .then((session) => {
            if (session.provider !== "vapi" || !session.providerAssistantId) {
              setTestSessionError(BROWSER_TEST_SESSION_ERROR);
              return;
            }
            browserTest.start({ provider: "vapi", providerAssistantId: session.providerAssistantId });
          })
          .catch(() => {
            // Never surfaces the response body: it could carry provider text.
            setTestSessionError(BROWSER_TEST_SESSION_ERROR);
          })
          .finally(() => {
            testInFlightRef.current = false;
          });
      }
    : () => {};

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
  if (publishInBuild && publishMutation.isPending) statusLabel = "Publishing…";
  else if (updateMutation.isPending) statusLabel = "Saving…";
  else if (isDirty) statusLabel = "Unsaved changes";
  // AR-001V requirement 16. A published row is only ever labelled "· Saved"
  // when the provider is proven to be running this exact configuration.
  // Every other synchronization state — including "unknown", which is what a
  // missing digest or an unreadable catalog produces — gets its own honest
  // label instead, so the badge can never assert agreement we cannot show.
  else if (assistant.status === "published" && assistant.providerSyncState !== "synchronized") {
    statusLabel =
      assistant.providerSyncState === "synchronizing"
        ? "Updating voice provider…"
        : assistant.providerSyncState === "interrupted"
          ? "Voice provider update interrupted"
        : assistant.providerSyncState === "sync_failed"
          ? "Voice provider update failed"
          : "Not sent to voice provider";
  } else statusLabel = `${STATUS_LABEL[assistant.status]} · Saved`;

  const announcement = publishInBuild && publishMutation.isPending
    ? "Publishing is in progress. Do not submit again."
    : assistant.status === "publish_uncertain"
      ? "Publishing could not be confirmed. Do not publish again. Contact support before taking another action."
      : assistant.status === "publishing"
        ? "Publishing is already in progress."
        : publishInBuild && publishBanner
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
        onTabChange={(t) => navigate(assistantHref(numericId!, t))}
        backHref="/assistants"
        statusBadge={statusLabel}
        announcement={announcement}
        contentDisabled={publishMutation.isPending || browserTest.isActive}
        publishControl={
          publishInBuild ? (
            <PublishButton
              ref={publishButtonRef}
              eligible={publishEligible}
              pending={publishMutation.isPending}
              disabledReason={publishDisabledReason()}
              onClick={openPublishDialog}
            />
          ) : undefined
        }
        testControl={
          browserTestInBuild ? (
            <BrowserTestButton
              ref={testButtonRef}
              eligible={testEligible}
              active={browserTest.isActive}
              disabledReason={testDisabledReason}
              onClick={openTestDialog}
            />
          ) : undefined
        }
        syncControl={syncInBuild ? (
          <SyncAssistantButton
            ref={syncButtonRef}
            eligible={syncEligible}
            pending={syncMutation.isPending}
            disabledReason={syncDisabledReason}
            onClick={openSyncDialog}
          />
        ) : undefined}
        testPanel={
          browserTestInBuild ? (
            <BrowserTestPanel
              state={browserTest.state}
              assistantName={draft.setup.assistantName || "Untitled assistant"}
              elapsedSeconds={browserTest.elapsedSeconds}
              errorMessage={browserTest.errorMessage}
              onEnd={browserTest.end}
              onDismiss={browserTest.dismiss}
            />
          ) : undefined
        }
        headerBanner={
          <>
            {hydrationWarning && (
              <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning-foreground dark:text-warning">
                This assistant's saved configuration couldn't be fully read, so defaults are shown here. Saving will
                replace it with the values currently in the builder.
              </div>
            )}
            {!isSupportedVoicePreset(draft.voiceModel.preset) && (
              <div
                role="status"
                className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-warning-foreground dark:text-warning"
              >
                <span className="font-semibold">{PRESET_RECOVERY.title}.</span>{" "}
                {PRESET_RECOVERY.detail}
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
            {browserTestInBuild && testSessionError && (
              <div role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                {testSessionError}
              </div>
            )}
            {syncBanner && (
              <div role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                {syncBanner}
              </div>
            )}
            {assistant.status === "published" && !isDirty && assistant.providerSyncState === "local_changes" && (
              <div role="status" className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning-foreground dark:text-warning">
                This configuration is saved here but has not been sent to the voice provider. The provider is still
                running the last configuration it confirmed.
              </div>
            )}
            {assistant.status === "published" ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {BUILDER.linkedNote}
                {syncedAtDisplay ? ` ${lastSyncedNote(syncedAtDisplay)}` : ""}
              </p>
            ) : (
              !deletable && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {BUILDER.notLinkedNote}
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
            {unsavedChangesPrompt !== null && isDirty && assistant.status !== "publishing" && (
              <p className="max-w-xs text-right text-[11px] text-muted-foreground">
                {unsavedChangesPrompt}
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
      {publishInBuild && (
        <PublishConfirmDialog
          open={publishDialogOpen}
          assistantName={draft.setup.assistantName || "Untitled assistant"}
          statusLabel={STATUS_LABEL[assistant.status]}
          pending={publishMutation.isPending}
          onCancel={cancelPublishDialog}
          onConfirm={confirmPublish}
        />
      )}
      {syncInBuild && (
        <SyncConfirmDialog
          open={syncDialogOpen}
          assistantName={draft.setup.assistantName || "Untitled assistant"}
          onCancel={cancelSyncDialog}
          onConfirm={confirmSync}
        />
      )}
      {browserTestInBuild && (
        <BrowserTestConfirmDialog
          open={testDialogOpen}
          assistantName={draft.setup.assistantName || "Untitled assistant"}
          onCancel={cancelTestDialog}
          onConfirm={confirmTest}
        />
      )}
    </>
  );
}
