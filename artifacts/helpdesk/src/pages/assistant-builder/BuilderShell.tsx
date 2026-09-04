import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, PlayCircle, Rocket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { UnavailableActionButton } from "@/components/common/UnavailableActionButton";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { findVoicePreset } from "@/lib/assistantEstimates";
import { PRESET_RECOVERY } from "@/pages/assistants/assistantsContract";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";
import { voicePlatformEnabled, voicePublishEnabled, voiceBrowserTestEnabled, voiceSyncEnabled } from "@/lib/featureFlags";
import { useWorkspaceBusinessInfo, type WorkspaceBusinessInfo } from "@/hooks/useWorkspaceBusinessInfo";

import ConfigurationTab from "@/pages/assistant-builder/ConfigurationTab";
import PromptTab from "@/pages/assistant-builder/PromptTab";
import VoiceTab from "@/pages/assistant-builder/VoiceTab";

/**
 * ── V5 PR-6 (C-5) ─────────────────────────────────────────────────────────
 *
 * Within a voice-enabled build, the Test call and Publish controls are now
 * always rendered — as a real control when their own sub-flag is on, and as
 * a disabled placeholder naming the reason when it is off. A build with
 * `voicePlatformEnabled` false still shows neither: this is "always visible
 * in the voice build", not "always visible everywhere", so a default build
 * still ships no voice-builder chrome at all.
 *
 * The disabled placeholder is `UnavailableActionButton` — already imported
 * unconditionally above and carrying no publish/browser-test/provider
 * dependency of its own — so a build with a sub-flag off still never pulls
 * in `PublishButton`, `BrowserTestButton`, or anything past them; only the
 * caller (`AssistantBuilder.tsx`/`AssistantBuilderNew.tsx`) still supplies
 * the real control, and only from its own flag-on branch, exactly as before.
 */
const publishInBuild = voicePlatformEnabled && voicePublishEnabled;
const browserTestInBuild = voicePlatformEnabled && voiceBrowserTestEnabled;
/**
 * AR-001V: the provider-synchronization control is gated by the platform flag
 * alone. It is neither a publish nor a browser test — it updates a resource
 * that already exists — and the server independently refuses to contact the
 * provider unless VOICE_PUBLISH_ENABLED is true, so nothing here can reach a
 * provider on its own.
 */
const syncInBuild = voicePlatformEnabled && voiceSyncEnabled;

const NOT_ENABLED_REASON = "Not enabled on this workspace yet.";

/**
 * V5 PR-6 (C-2/C-4): "Setup" -> "Configuration", "Voice & Model" -> "Voice".
 * `BUILDER_TAB_ALIASES` below maps the old keys so a previously-shared or
 * bookmarked URL still resolves — see `resolveBuilderTab`.
 */
export const BUILDER_TABS = [
  { key: "configuration", label: "Configuration" },
  { key: "prompt", label: "Prompt" },
  { key: "voice", label: "Voice" },
] as const;

export type BuilderTabKey = (typeof BUILDER_TABS)[number]["key"];

export function isBuilderTabKey(
  value: string | undefined,
): value is BuilderTabKey {
  return BUILDER_TABS.some((t) => t.key === value);
}

/** Legacy tab keys, mapped to their current replacement. */
export const BUILDER_TAB_ALIASES: Record<string, BuilderTabKey> = {
  setup: "configuration",
  "voice-model": "voice",
};

/**
 * Resolves a raw route param to a tab key: the value itself when already
 * canonical, its alias when it's a known legacy key, or `undefined` when
 * it's neither (an unrecognized tab, or no tab at all) — the caller decides
 * the default and whether to redirect.
 */
export function resolveBuilderTab(value: string | undefined): BuilderTabKey | undefined {
  if (value === undefined) return undefined;
  if (isBuilderTabKey(value)) return value;
  return BUILDER_TAB_ALIASES[value];
}

export interface BuilderTabProps {
  draft: AssistantDraft;
  update: (updater: (draft: AssistantDraft) => AssistantDraft) => void;
  /** V5 PR-6 (C-2): the firm's business name/industry from Workspace Settings, or `null` until it loads. Read-only. */
  businessInfo: WorkspaceBusinessInfo | null;
}

function TabPanel({
  tab,
  draft,
  update,
  businessInfo,
}: { tab: BuilderTabKey } & BuilderTabProps) {
  switch (tab) {
    case "configuration":
      return <ConfigurationTab draft={draft} update={update} businessInfo={businessInfo} />;
    case "prompt":
      return <PromptTab draft={draft} update={update} businessInfo={businessInfo} />;
    case "voice":
      return <VoiceTab draft={draft} update={update} businessInfo={businessInfo} />;
    default:
      return null;
  }
}

interface BuilderShellProps extends Pick<BuilderTabProps, "draft" | "update"> {
  tab: BuilderTabKey;
  onTabChange: (tab: BuilderTabKey) => void;
  backHref: string;
  statusBadge: ReactNode;
  headerBanner?: ReactNode;
  footerRight: ReactNode;
  /** Screen-reader-only save-status announcement (aria-live). */
  announcement: string;
  /**
   * Milestone 1 / Checkpoint E3C: the Publish control for this builder
   * instance. Defaults to the standing "unavailable" placeholder (matching
   * pre-E3C behavior) when the caller doesn't supply one — the new/unsaved
   * builder always uses the default, since publishing is never eligible for
   * an unpersisted assistant.
   */
  publishControl?: ReactNode;
  /**
   * Milestone 1 / Checkpoint F1: the Test control for this builder
   * instance. Defaults to the standing "unavailable" placeholder when the
   * caller doesn't supply one — the new/unsaved builder always uses the
   * default, since testing is never eligible for an unpersisted assistant.
   */
  testControl?: ReactNode;
  /**
   * AR-001V: the provider-synchronization control for this builder instance.
   * Omitted entirely by the new/unsaved builder, where no published provider
   * resource exists to update.
   */
  syncControl?: ReactNode;
  /** Milestone 1 / Checkpoint F1: the active browser-test panel, rendered below the header banner when a test is in progress or has just ended. */
  testPanel?: ReactNode;
  /**
   * True while a publish request is in flight for this assistant. Disables
   * the name field and every tab's editable controls (via a fieldset) so a
   * publish attempt can't race a concurrent edit — mirrors the existing
   * disabled Save Draft behavior during that same window.
   */
  contentDisabled?: boolean;
}

/**
 * Shared chrome for both the new-unsaved and persisted assistant builder
 * routes: header (name field, status badge, disabled Test/Publish), the
 * launch-candidate builder tabs, and the sticky estimate/save footer. Only the parts
 * that differ between "new" and "persisted" (status badge, save control,
 * banner) are passed in by the caller.
 */
export function BuilderShell({
  draft,
  update,
  tab,
  onTabChange,
  backHref,
  statusBadge,
  headerBanner,
  footerRight,
  announcement,
  publishControl,
  testControl,
  syncControl,
  testPanel,
  contentDisabled = false,
}: BuilderShellProps) {
  // Undefined when the saved config carries a retired preset. The footer
  // then says the estimates are unavailable rather than showing figures
  // belonging to a preset the customer never chose.
  const preset = findVoicePreset(draft.voiceModel.preset);

  // V5 PR-6 (C-2): fetched once here so every tab sees the same read-only
  // workspace business name/industry, then one-way synced into
  // `draft.setup` so a save (which runs synchronously — see
  // `serializeDraftToConfig`) always has a value even before this fetch
  // resolves. Never synced back the other way, and never itself a source of
  // an "unsaved changes" state: the effect only fires when the fetched value
  // actually differs from what the draft already holds.
  const businessInfo = useWorkspaceBusinessInfo();
  const updateRef = useRef(update);
  updateRef.current = update;
  const syncedBusinessInfoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!businessInfo.data) return;
    const key = `${businessInfo.data.name} ${businessInfo.data.industry}`;
    if (syncedBusinessInfoRef.current === key) return;
    syncedBusinessInfoRef.current = key;
    if (draft.setup.businessName === businessInfo.data.name && draft.setup.industry === businessInfo.data.industry) {
      return;
    }
    updateRef.current((d) => ({
      ...d,
      setup: { ...d.setup, businessName: businessInfo.data!.name, industry: businessInfo.data!.industry },
    }));
    // Only the fetched value should re-trigger this — reading draft.setup
    // here would fight with the customer's own edits to unrelated fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessInfo.data]);

  const activeTabLabel = BUILDER_TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-6 py-4">
        <Link
          href="/assistants"
          className="inline-flex min-h-11 items-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground md:min-h-0 md:py-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Assistants
        </Link>
        <h1 className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Assistant Builder
        </h1>
        {/* V5 PR-6 (C-6): local breadcrumb — the lead swaps this for the shared
            component once one exists. `Assistant / {name} / {Tab}`. */}
        <nav aria-label="Breadcrumb" className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>Assistant</span>
          <span aria-hidden="true">/</span>
          <span className="max-w-[10rem] truncate font-medium text-foreground">
            {draft.setup.assistantName || "Untitled assistant"}
          </span>
          <span aria-hidden="true">/</span>
          <span>{activeTabLabel}</span>
        </nav>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Input
              aria-label="Assistant name"
              value={draft.setup.assistantName}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  setup: { ...d.setup, assistantName: e.target.value },
                }))
              }
              placeholder="Untitled assistant"
              maxLength={100}
              disabled={contentDisabled}
              className="h-9 max-w-xs text-sm font-semibold"
            />
            <Badge
              variant="secondary"
              className="flex-shrink-0 text-xs font-medium"
            >
              {statusBadge}
            </Badge>
          </div>
          {voicePlatformEnabled && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {browserTestInBuild ? (
                testControl ?? (
                  <UnavailableActionButton
                    icon={PlayCircle}
                    label="Test call"
                    availability="Save and publish this assistant before testing."
                  />
                )
              ) : (
                <UnavailableActionButton icon={PlayCircle} label="Test call" availability={NOT_ENABLED_REASON} />
              )}
              {publishInBuild ? (
                publishControl ?? (
                  <UnavailableActionButton
                    icon={Rocket}
                    label="Publish"
                    availability="Save this assistant as a draft before publishing."
                  />
                )
              ) : (
                <UnavailableActionButton icon={Rocket} label="Publish" availability={NOT_ENABLED_REASON} />
              )}
              {syncInBuild && syncControl}
            </div>
          )}
        </div>
        {headerBanner && <div className="mt-3">{headerBanner}</div>}
        {browserTestInBuild && testPanel && <div className="mt-3">{testPanel}</div>}
      </div>

      {/* Tabs + content */}
      <Tabs
        value={tab}
        onValueChange={(v) => isBuilderTabKey(v) && onTabChange(v)}
        className="flex min-h-0 flex-1 flex-col md:flex-row"
      >
        <div className="relative flex-shrink-0 md:w-48">
          <TabsList
            aria-label="Assistant builder sections"
            className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-2 md:w-48 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3"
          >
            {BUILDER_TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="w-auto min-h-11 shrink-0 justify-start whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-surface-muted data-[state=active]:text-primary data-[state=active]:shadow-none md:w-full"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden"
          />
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <fieldset disabled={contentDisabled} className="min-w-0">
            <TabPanel tab={tab} draft={draft} update={update} businessInfo={businessInfo.data} />
          </fieldset>
        </div>
      </Tabs>

      {/* Sticky estimate summary + save */}
      <div className="flex-shrink-0 border-t border-border bg-card px-6 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-4 sm:flex sm:gap-8">
            {preset === undefined ? (
              <p className="col-span-2 self-center text-[11px] text-muted-foreground">
                {PRESET_RECOVERY.estimatesUnavailable}
              </p>
            ) : (
              <>
                <CostBreakdown preset={preset} compact />
                <LatencyMeter latencyMs={preset.latencyMs} compact />
              </>
            )}
          </div>
          {footerRight}
        </div>
      </div>
    </div>
  );
}
