import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Save, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/PageSkeleton";
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
import { useWorkspaceBusinessInfo } from "@/hooks/useWorkspaceBusinessInfo";
import { AssistantApiRequestError, normalizeSyncRouteErrorCode, fetchBrowserTestSession } from "@/lib/assistantsApi";
import { serializeDraftToConfig, hydrateConfigToDraft } from "@/lib/assistantConfig";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";
import {
  BuilderShell,
  isBuilderTabKey,
  resolveBuilderTab,
  type BuilderTabKey,
} from "@/pages/assistant-builder/BuilderShell";
import { voicePlatformEnabled, voicePublishEnabled, voiceBrowserTestEnabled, voiceSyncEnabled } from "@/lib/featureFlags";
import { STATUS_LABEL, isEligibleForDelete, isPublishableStatus } from "@/lib/assistantStatus";
import { publishRouteErrorMessage, safeSyncErrorMessage } from "@/lib/publishErrors";
import { unavailableChoice, useVoiceOptions } from "@/lib/voiceOptions";
import { browserTestDisabledReason, browserTestSyncWarning } from "@/lib/browserVoice/eligibility";
import {
  BUILDER,
  PRESET_RECOVERY,
  VOICE_UNAVAILABLE,
  SAVE,
  SYNC,
  SAVE_PROMPT_EITHER,
  SAVE_PROMPT_PUBLISH,
  SAVE_PROMPT_TEST,
  DEFAULT_BUILDER_TAB,
  assistantHref,
  isSupportedVoicePreset,
  lastSyncedNote,
} from "@/pages/assistants/assistantsContract";

export type { BuilderTabProps } from "@/pages/assistant-builder/BuilderShell";

const ROUTE_ID_PATTERN = /^[1-9]\d*$/;
const PUBLISHING_POLL_INTERVAL_MS = 4000;

function BuilderDetailSkeleton() {
  return <PageSkeleton label="Loading this assistant" list />;
}

const NOTICE_TONE = {
  warn: {
    border: "var(--sd-warn-border, rgba(138,82,0,.28))",
    background: "var(--sd-warn-surface, #fdf6ec)",
    text: "var(--sd-warn, #8a5200)",
  },
  danger: {
    border: "var(--sd-danger-border, rgba(156,34,51,.28))",
    background: "var(--sd-danger-surface, #fdf2f3)",
    text: "var(--sd-danger, #9c2233)",
  },
  info: {
    border: "var(--sd-border-strong, rgba(59,82,101,.24))",
    background: "var(--sd-surface-alt, #f6fbfa)",
    text: "var(--sd-text-muted, #3b5265)",
  },
} as const;

/**
 * One shape for every banner this page raises, built from the shell's own
 * tokens. The tone is never the only signal: each notice carries its condition
 * in words, and the caller decides whether it is announced as a status or an
 * alert — `publish_uncertain` is the one that must interrupt.
 */
function Notice({
  tone,
  role,
  title,
  children,
  action,
}: {
  tone: keyof typeof NOTICE_TONE;
  role: "status" | "alert";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const palette = NOTICE_TONE[tone];
  return (
    <div
      role={role}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--sd-space-3, .75rem)",
        padding: "var(--sd-space-4, 1rem) var(--sd-space-5, 1.25rem)",
        border: `1px solid ${palette.border}`,
        borderLeftWidth: 3,
        borderRadius: "var(--sd-radius-card, 10px)",
        background: palette.background,
        minWidth: 0,
      }}
    >
      <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
        {title && (
          <span
            style={{
              display: "block",
              fontSize: "var(--sd-text-body, .875rem)",
              fontWeight: 600,
              color: "var(--sd-text, #051824)",
            }}
          >
            {title}
          </span>
        )}
        <p
          style={{
            margin: title ? "2px 0 0" : 0,
            fontSize: "var(--sd-text-small, .8125rem)",
            lineHeight: 1.55,
            color: palette.text,
            overflowWrap: "anywhere",
          }}
        >
          {children}
        </p>
      </div>
      {action}
    </div>
  );
}

function draftKey(
  draft: Pick<AssistantDraft, "setup" | "prompt" | "voiceModel" | "tools" | "analysis" | "advanced">,
  name: string,
): string {
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
  errorCategory: null,
  supportReference: null,
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
  const resolvedTab = resolveBuilderTab(params.tab);
  const tab: BuilderTabKey = resolvedTab ?? DEFAULT_BUILDER_TAB;

  const { data: assistant, isLoading, isError, error, refetch } = useAssistantDetail(numericId);
  const updateMutation = useUpdateAssistant(numericId ?? -1);
  const publishMutation = useBuilderPublish(numericId);
  const syncMutation = useBuilderSync(numericId);
  const voiceOptions = useVoiceOptions();

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
  const [renewingCredential, setRenewingCredential] = useState(false);
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
  // V5 PR-6 (C-2): the current workspace business name/industry, used only
  // at save time so a saved config's `setup.businessName`/`industry` (and
  // therefore the composed prompt) always reflects Workspace Settings, not
  // whatever this draft last hydrated. Never affects the dirty check.
  const businessInfo = useWorkspaceBusinessInfo();

  useEffect(() => {
    if (numericId === undefined) return;
    if (!params.tab) {
      navigate(assistantHref(numericId), { replace: true });
      return;
    }
    // A legacy tab key ("setup", "voice-model") resolves via the alias map
    // but isn't itself canonical — redirect once so the URL self-heals.
    if (!isBuilderTabKey(params.tab) && resolvedTab) {
      navigate(assistantHref(numericId, resolvedTab), { replace: true });
    }
  }, [params.tab, numericId, navigate, resolvedTab]);

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
        config: serializeDraftToConfig(draft, businessInfo.data ?? undefined),
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

  // One availability answer for eligibility, the blocker sentence and the
  // banner: the server catalog's, via the options endpoint. Unknown (still
  // loading or failed) is not treated as available.
  const voiceChoiceProblem = draft
    ? voiceOptions.data
      ? unavailableChoice(voiceOptions.data, draft.voiceModel.preset, draft.voiceModel.voice)
      : isSupportedVoicePreset(draft.voiceModel.preset)
        ? null
        : "style"
    : null;
  const voiceChoiceKnown = !!voiceOptions.data;

  const publishEligible =
    publishInBuild &&
    voiceChoiceKnown &&
    voiceChoiceProblem === null &&
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
        // V5 PR-6 (C-5): named before the customer spends a publish attempt on
        // it. The server independently requires a non-empty greeting when
        // firstMessageMode is "assistant-speaks-first" (see
        // persistedConfigMapper.ts, read-only) — this only says so first.
        if (draft.prompt.firstMessageMode === "assistant-speaks-first" && draft.prompt.firstMessage.trim().length === 0) {
          return "Add a greeting before publishing.";
        }
        // Not a server-enforced rule — a business prerequisite for a
        // trustworthy call: every assistant should know the business's
        // timezone before it goes live.
        if (draft.setup.timezone.trim().length === 0) return "Add a business timezone before publishing.";
        // Checked before the in-flight reasons so a retired preset is named as
        // the blocker rather than being hidden behind a transient one. The server
        // would reject it with `unsupported_preset` anyway; this only says so
        // before the customer spends a publish attempt on it.
        if (voiceChoiceProblem !== null) return VOICE_UNAVAILABLE.publishBlocked;
        if (!voiceChoiceKnown)
          return voiceOptions.isError
            ? "Voice choices couldn't be checked. Reload the page to try again."
            : "Checking voice choices…";
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
        void runBrowserTestSession(false);
      }
    : () => {};

  /**
   * AR-001V.3 controlled recovery. `replaceToken` is passed ONLY from the
   * recovery action below, which appears only after the provider actually
   * refused this assistant's credential. An ordinary Start Browser Test never
   * discards a working token, and the replacement is scoped identically — there
   * is no fallback to a broader key anywhere on this path.
   */
  function runBrowserTestSession(replaceToken: boolean): Promise<void> {
    if (numericId === undefined) return Promise.resolve();
    if (replaceToken) setRenewingCredential(true);
    return fetchBrowserTestSession(numericId, { replaceToken })
      .then((session) => {
        if (session.provider !== "vapi" || !session.providerAssistantId) {
          setTestSessionError(BROWSER_TEST_SESSION_ERROR);
          return;
        }
        browserTest.start({
          provider: "vapi",
          providerAssistantId: session.providerAssistantId,
          publicKey: session.publicKey,
        });
      })
      .catch((err: unknown) => {
        // Never surfaces the response body: it could carry provider text. The
        // one exception is the plan check, whose fixed server wording says
        // why (not activated, paused for payment, cancelled).
        const apiErr = err instanceof AssistantApiRequestError ? err : undefined;
        setTestSessionError(
          // The message is already bounded and sanitized by the API client.
          // Deliberately not routed through the publish copy table, which a
          // build with publishing off must not ship.
          (apiErr?.code === "service_not_active" || apiErr?.code === "service_access_unavailable") && apiErr.message
            ? apiErr.message
            : BROWSER_TEST_SESSION_ERROR,
        );
      })
      .finally(() => {
        testInFlightRef.current = false;
        if (replaceToken) setRenewingCredential(false);
      });
  }

  if (!isValidId) {
    return (
      <div className="sd-page sd-enter">
        <div className="sd-empty">
          <h1 className="sd-empty__title">Invalid assistant link</h1>
          <p className="sd-empty__detail">This assistant link isn&rsquo;t valid. Go back to your assistants list.</p>
          <p style={{ marginTop: "var(--sd-space-4, 1rem)" }}>
            <Link href="/assistants" className="sd-step__action">
              Back to Assistants
            </Link>
          </p>
        </div>
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
        <div className="sd-page sd-enter">
          <div className="sd-empty">
            <h1 className="sd-empty__title">Assistant not found</h1>
            <p className="sd-empty__detail">
              This assistant doesn&rsquo;t exist, or you don&rsquo;t have access to it.
            </p>
            <p style={{ marginTop: "var(--sd-space-4, 1rem)" }}>
              <Link href="/assistants" className="sd-step__action">
                Back to Assistants
              </Link>
            </p>
          </div>
        </div>
      );
    }
    const message = error instanceof AssistantApiRequestError ? error.message : undefined;
    return (
      <div className="sd-page sd-enter">
        <section className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">Couldn&rsquo;t load this assistant</span>
            <p className="sd-error__detail">
              {message ?? "The request failed. Nothing was lost — your settings are still saved."}
            </p>
          </div>
          <button type="button" className="sd-error__action" onClick={() => refetch()}>
            Try again
          </button>
        </section>
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
              supportReference={browserTest.supportReference}
              onEnd={browserTest.end}
              onDismiss={browserTest.dismiss}
              // Offered for exactly one category: the provider refused this
              // assistant's credential. A microphone or network failure gets no
              // such button, because a new key would not fix it.
              onRetryWithNewCredential={
                browserTest.errorCategory === "provider_not_authorized"
                  ? () => void runBrowserTestSession(true)
                  : undefined
              }
              retryingCredential={renewingCredential}
            />
          ) : undefined
        }
        headerBanner={
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sd-space-3, .75rem)" }}>
            {hydrationWarning && (
              <Notice tone="warn" role="status" title="Some saved settings couldn't be read">
                Defaults are shown where they could not be read. Saving replaces them with the values currently in
                the builder.
              </Notice>
            )}
            {voiceChoiceProblem !== null && (
              <Notice
                tone="warn"
                role="status"
                title={voiceChoiceProblem === "voice" ? VOICE_UNAVAILABLE.voiceTitle : VOICE_UNAVAILABLE.styleTitle}
              >
                {voiceChoiceProblem === "voice" ? VOICE_UNAVAILABLE.voiceDetail : VOICE_UNAVAILABLE.styleDetail}{" "}
                Open Greeting &amp; voice to choose.
              </Notice>
            )}
            {assistant.status === "error" && assistant.syncError && (
              <Notice tone="danger" role="status" title="Publish failed">
                {safeSyncErrorMessage(assistant.syncError)}
              </Notice>
            )}
            {assistant.status === "publish_uncertain" && (
              <Notice tone="danger" role="alert" title="Publishing could not be confirmed">
                Publishing could not be confirmed. Do not publish again. Contact support before taking another action.
              </Notice>
            )}
            {assistant.status === "publishing" && (
              <Notice
                tone="info"
                role="status"
                action={
                  <button type="button" className="sd-error__action" onClick={() => refetch()}>
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Refresh status
                  </button>
                }
              >
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                  style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 6 }}
                />
                Publishing is already in progress.
              </Notice>
            )}
            {publishBanner && assistant.status !== "error" && assistant.status !== "publish_uncertain" && (
              <Notice tone="danger" role="alert" title="Publish failed">
                {publishBanner}
              </Notice>
            )}
            {browserTestInBuild && testSessionError && (
              <Notice tone="danger" role="alert" title="The test couldn't start">
                {testSessionError}
              </Notice>
            )}
            {syncBanner && (
              <Notice tone="danger" role="alert" title="The voice provider wasn't updated">
                {syncBanner}
              </Notice>
            )}
            {assistant.status === "published" && !isDirty && assistant.providerSyncState === "local_changes" && (
              <Notice tone="warn" role="status" title={SYNC.localChangesTitle}>
                {SYNC.localChangesDetail}
                {/*
                  Without the sync capability there is no control on this page
                  that can close that gap — Publish is spent once an assistant
                  is published. Naming the dependency is the honest answer; a
                  disabled button would imply the owner could fix it here.
                  Folded out of a sync-enabled build, where the control exists.
                */}
                {!syncInBuild && <> {SYNC.unavailableDetail}</>}
              </Notice>
            )}
            {assistant.status === "published" ? (
              <p className="sd-page__meta">
                {BUILDER.linkedNote}
                {syncedAtDisplay ? ` ${lastSyncedNote(syncedAtDisplay)}` : ""}
              </p>
            ) : (
              !deletable && <p className="sd-page__meta">{BUILDER.notLinkedNote}</p>
            )}
          </div>
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
                  fontWeight: isDirty ? 600 : 400,
                  color: isDirty ? "var(--sd-text, #051824)" : "var(--sd-text-muted, #3b5265)",
                }}
              >
                {updateMutation.isPending ? SAVE.saving : isDirty ? SAVE.dirty : SAVE.clean}
              </p>
              {unsavedChangesPrompt !== null && isDirty && assistant.status !== "publishing" && (
                <p
                  style={{
                    margin: "var(--sd-space-1, .25rem) 0 0",
                    fontSize: "var(--sd-text-small, .8125rem)",
                    color: "var(--sd-text-muted, #3b5265)",
                  }}
                >
                  {unsavedChangesPrompt}
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
            <Button onClick={handleSave} disabled={saveDisabled}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {updateMutation.isPending ? SAVE.saving : SAVE.save}
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
          syncWarning={browserTestSyncWarning(assistant)}
          onCancel={cancelTestDialog}
          onConfirm={confirmTest}
        />
      )}
    </>
  );
}
