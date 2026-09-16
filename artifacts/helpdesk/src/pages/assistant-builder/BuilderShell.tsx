import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, PlayCircle, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { UnavailableActionButton } from "@/components/common/UnavailableActionButton";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { findVoicePreset } from "@/lib/assistantEstimates";
import {
  BUILDER_PAGE,
  PRESET_RECOVERY,
  SECTIONS,
  TEST_PUBLISH,
} from "@/pages/assistants/assistantsContract";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";
import { voicePlatformEnabled, voicePublishEnabled, voiceBrowserTestEnabled, voiceSyncEnabled } from "@/lib/featureFlags";
import { useWorkspaceBusinessInfo, type WorkspaceBusinessInfo } from "@/hooks/useWorkspaceBusinessInfo";

import ActionsTab from "@/pages/assistant-builder/ActionsTab";
import ConfigurationTab from "@/pages/assistant-builder/ConfigurationTab";
import PromptTab from "@/pages/assistant-builder/PromptTab";
import VoiceTab from "@/pages/assistant-builder/VoiceTab";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-signin.css";

/**
 * Within a voice-enabled build, the Test call and Publish controls are always
 * rendered — as a real control when their own sub-flag is on, and as a
 * disabled placeholder naming the reason when it is off. A build with
 * `voicePlatformEnabled` false shows neither: this is "always visible in the
 * voice build", not "always visible everywhere", so a default build still
 * ships no voice-builder chrome at all.
 *
 * The disabled placeholder is `UnavailableActionButton` — already imported
 * unconditionally above and carrying no publish/browser-test/provider
 * dependency of its own — so a build with a sub-flag off still never pulls in
 * `PublishButton`, `BrowserTestButton`, or anything past them.
 */
const publishInBuild = voicePlatformEnabled && voicePublishEnabled;
const browserTestInBuild = voicePlatformEnabled && voiceBrowserTestEnabled;
/**
 * The provider-synchronization control is gated by the platform flag alone. It
 * is neither a publish nor a browser test — it updates a resource that already
 * exists — and the server independently refuses to contact the provider unless
 * VOICE_PUBLISH_ENABLED is true, so nothing here can reach a provider on its
 * own.
 */
const syncInBuild = voicePlatformEnabled && voiceSyncEnabled;

/**
 * The builder's five sections. The keys are routing and are unchanged; only
 * the labels moved, into `SECTIONS` in the contract module, so the list page's
 * quick links and this rail cannot name the same destination differently.
 * `BUILDER_TAB_ALIASES` below maps the old keys so a previously-shared or
 * bookmarked URL still resolves — see `resolveBuilderTab`.
 */
export const BUILDER_TABS = [
  { key: "configuration", label: SECTIONS.configuration },
  { key: "voice", label: SECTIONS.voice },
  { key: "actions", label: SECTIONS.actions },
  { key: "testing", label: SECTIONS.testing },
  { key: "prompt", label: SECTIONS.prompt },
] as const;

export type BuilderTabKey = (typeof BUILDER_TABS)[number]["key"];

export function isBuilderTabKey(value: string | undefined): value is BuilderTabKey {
  return BUILDER_TABS.some((t) => t.key === value);
}

/** Legacy tab keys, mapped to their current replacement. */
export const BUILDER_TAB_ALIASES: Record<string, BuilderTabKey> = {
  setup: "configuration",
  "voice-model": "voice",
  // The sections were renamed but kept their keys, so every previously shared
  // link still resolves. These three cover the business-language names a
  // customer might type or a future link might use.
  business: "configuration",
  greeting: "voice",
  advanced: "prompt",
};

/**
 * Resolves a raw route param to a tab key: the value itself when already
 * canonical, its alias when it's a known legacy key, or `undefined` when it's
 * neither (an unrecognized tab, or no tab at all) — the caller decides the
 * default and whether to redirect.
 */
export function resolveBuilderTab(value: string | undefined): BuilderTabKey | undefined {
  if (value === undefined) return undefined;
  if (isBuilderTabKey(value)) return value;
  return BUILDER_TAB_ALIASES[value];
}

export interface BuilderTabProps {
  draft: AssistantDraft;
  update: (updater: (draft: AssistantDraft) => AssistantDraft) => void;
  /** The firm's business name/industry from Workspace Settings, or `null` until it loads. Read-only. */
  businessInfo: WorkspaceBusinessInfo | null;
}

function TabPanel({ tab, draft, update, businessInfo }: { tab: BuilderTabKey } & BuilderTabProps) {
  switch (tab) {
    case "configuration":
      return <ConfigurationTab draft={draft} update={update} businessInfo={businessInfo} />;
    case "prompt":
      return <PromptTab draft={draft} update={update} businessInfo={businessInfo} />;
    case "voice":
      return <VoiceTab draft={draft} update={update} businessInfo={businessInfo} />;
    case "actions":
      return <ActionsTab draft={draft} update={update} businessInfo={businessInfo} />;
    case "testing":
      // Rendered by the shell, which owns the publish/test/sync controls.
      return null;
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
  /** The Publish control for this builder instance. */
  publishControl?: ReactNode;
  /** The Test control for this builder instance. */
  testControl?: ReactNode;
  /** The provider-synchronization control. Omitted by the new/unsaved builder. */
  syncControl?: ReactNode;
  /** The active browser-test panel. */
  testPanel?: ReactNode;
  /**
   * True while a publish request is in flight. Disables the name field and
   * every section's editable controls (via a fieldset) so a publish attempt
   * can't race a concurrent edit.
   */
  contentDisabled?: boolean;
}

/**
 * Shared chrome for both the new-unsaved and persisted builder routes.
 *
 * This used to be a header card, a tab strip, a content card and a footer bar,
 * all written in utility classes — a second visual language inside a dashboard
 * that already had one. It is now the same `sd-page`/`PageHeader` frame every
 * other screen uses, with the sections as a plain labelled nav and each
 * section's fields inside one `si-form` (which is what makes the shared
 * `si-input` tokens resolve — see `.sd-app .si-form` in `v5-app.css`).
 *
 * Only the parts that genuinely differ between "new" and "persisted" — the
 * status, the save control, the banners — are still passed in by the caller.
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
  // Undefined when the saved config carries a retired preset. The foot then
  // says the estimates are unavailable rather than showing figures belonging
  // to a preset the customer never chose.
  const preset = findVoicePreset(draft.voiceModel.preset);

  // Fetched once here so every section sees the same read-only workspace
  // business name/industry, then one-way synced into `draft.setup` so a save
  // (which runs synchronously) always has a value even before this fetch
  // resolves. Never synced back the other way, and never itself a source of an
  // "unsaved changes" state: the effect only fires when the fetched value
  // actually differs from what the draft already holds.
  const businessInfo = useWorkspaceBusinessInfo();
  const updateRef = useRef(update);
  updateRef.current = update;
  const syncedBusinessInfoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!businessInfo.data) return;
    const key = `${businessInfo.data.name} ${businessInfo.data.industry}`;
    if (syncedBusinessInfoRef.current === key) return;
    syncedBusinessInfoRef.current = key;
    if (draft.setup.businessName === businessInfo.data.name && draft.setup.industry === businessInfo.data.industry) {
      return;
    }
    updateRef.current((d) => ({
      ...d,
      setup: { ...d.setup, businessName: businessInfo.data!.name, industry: businessInfo.data!.industry },
    }));
    // Only the fetched value should re-trigger this — reading draft.setup here
    // would fight with the customer's own edits to unrelated fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessInfo.data]);

  const activeTabLabel = BUILDER_TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <div className="sd-page sd-enter">
      <div aria-live="polite" className="sd-sr">
        {announcement}
      </div>

      <PageHeader
        eyebrow={BUILDER_PAGE.eyebrow}
        title={draft.setup.assistantName || BUILDER_PAGE.untitled}
        description={activeTabLabel}
        breadcrumb={
          <Link href={backHref} className="sd-link">
            <ArrowLeft className="sd-navlink__icon" aria-hidden="true" />
            {BUILDER_PAGE.back}
          </Link>
        }
        action={<span className="sd-chip">{statusBadge}</span>}
      />

      {/* The name is edited once, here, so it stays visible from every
          section — it used to be both a header field and a field inside the
          first section, two inputs bound to one value on one screen. */}
      <section className="sd-section" aria-label={BUILDER_PAGE.identityLabel}>
        <div className="si-form" style={{ maxWidth: "none" }}>
          <div className="si-field">
            <label className="si-label" htmlFor="assistant-name">
              {BUILDER_PAGE.nameLabel}
            </label>
            <input
              id="assistant-name"
              className="si-input"
              type="text"
              value={draft.setup.assistantName}
              onChange={(e) =>
                update((d) => ({ ...d, setup: { ...d.setup, assistantName: e.target.value } }))
              }
              placeholder={BUILDER_PAGE.untitled}
              maxLength={100}
              disabled={contentDisabled}
              aria-describedby="assistant-name-help"
            />
            <p className="si-hint" id="assistant-name-help">
              {BUILDER_PAGE.nameHelp}
            </p>
          </div>
        </div>
      </section>

      {headerBanner && <section className="sd-section">{headerBanner}</section>}
      {browserTestInBuild && testPanel && <section className="sd-section">{testPanel}</section>}

      <nav aria-label={BUILDER_PAGE.sectionsLabel}>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--sd-space-2, .5rem)",
          }}
        >
          {BUILDER_TABS.map((t) => (
            <li key={t.key}>
              <Button
                type="button"
                variant={tab === t.key ? "default" : "outline"}
                size="sm"
                aria-current={tab === t.key ? "page" : undefined}
                onClick={() => onTabChange(t.key)}
              >
                {t.label}
              </Button>
            </li>
          ))}
        </ul>
      </nav>

      <div style={{ minWidth: 0 }}>
        {tab === "testing" ? (
          <TestAndPublishPanel
            statusBadge={statusBadge}
            testControl={testControl}
            publishControl={publishControl}
            syncControl={syncControl}
          />
        ) : (
          <fieldset
            disabled={contentDisabled}
            className="si-form"
            style={{ maxWidth: "none", border: 0, margin: 0, padding: 0, minWidth: 0 }}
          >
            <TabPanel tab={tab} draft={draft} update={update} businessInfo={businessInfo.data} />
          </fieldset>
        )}

        {/* Technical guidance is secondary, so it sits at the foot of the
            Advanced section rather than in a bar over every screen. */}
        {tab === "prompt" && (
          <div
            style={{
              marginTop: "var(--sd-space-6, 1.5rem)",
              paddingTop: "var(--sd-space-4, 1rem)",
              borderTop: "1px solid var(--sd-border, rgba(59,82,101,.12))",
            }}
          >
            {preset === undefined ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--sd-text-small, .8125rem)",
                  color: "var(--sd-text-muted, #3b5265)",
                }}
              >
                {PRESET_RECOVERY.estimatesUnavailable}
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
                  gap: "var(--sd-space-4, 1rem)",
                }}
              >
                <CostBreakdown preset={preset} compact />
                <LatencyMeter latencyMs={preset.latencyMs} compact />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sd-section">{footerRight}</div>
    </div>
  );
}

/**
 * The "Test & publish" section.
 *
 * The controls themselves are the shell's existing publish/test/sync nodes,
 * unchanged — including every guard and disabled reason they already carry.
 * They are simply given a place of their own instead of competing for room in
 * a header, which is what made publishing feel like a developer action rather
 * than the last step of setting up.
 */
function TestAndPublishPanel({
  statusBadge,
  testControl,
  publishControl,
  syncControl,
}: {
  statusBadge: ReactNode;
  testControl?: ReactNode;
  publishControl?: ReactNode;
  syncControl?: ReactNode;
}) {
  const detail = {
    margin: "var(--sd-space-1, .25rem) 0 var(--sd-space-3, .75rem)",
    fontSize: "var(--sd-text-small, .8125rem)",
    lineHeight: 1.55,
    color: "var(--sd-text-muted, #3b5265)",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sd-space-6, 1.5rem)" }}>
      <section className="sd-section" aria-labelledby="test-publish-state">
        <div>
          <h2 className="sd-h2" id="test-publish-state">
            {TEST_PUBLISH.stateTitle}
          </h2>
          <p style={detail}>{TEST_PUBLISH.stateDetail}</p>
          <span className="sd-chip">{statusBadge}</span>
        </div>
      </section>

      <section className="sd-section" aria-labelledby="test-publish-test">
        <div>
          <h2 className="sd-h2" id="test-publish-test">
            {TEST_PUBLISH.testTitle}
          </h2>
          <p style={detail}>{TEST_PUBLISH.testDetail}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sd-space-2, .5rem)" }}>
            {browserTestInBuild ? (
              testControl ?? (
                <UnavailableActionButton
                  icon={PlayCircle}
                  label={TEST_PUBLISH.testLabel}
                  availability={TEST_PUBLISH.testUnavailableDefault}
                />
              )
            ) : (
              <UnavailableActionButton
                icon={PlayCircle}
                label={TEST_PUBLISH.testLabel}
                availability={TEST_PUBLISH.notEnabled}
              />
            )}
          </div>
        </div>
      </section>

      <section className="sd-section" aria-labelledby="test-publish-live">
        <div>
          <h2 className="sd-h2" id="test-publish-live">
            {TEST_PUBLISH.publishTitle}
          </h2>
          <p style={detail}>{TEST_PUBLISH.publishDetail}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sd-space-2, .5rem)" }}>
            {publishInBuild ? (
              publishControl ?? (
                <UnavailableActionButton
                  icon={Rocket}
                  label={TEST_PUBLISH.publishLabel}
                  availability={TEST_PUBLISH.publishUnavailableDefault}
                />
              )
            ) : (
              <UnavailableActionButton
                icon={Rocket}
                label={TEST_PUBLISH.publishLabel}
                availability={TEST_PUBLISH.notEnabled}
              />
            )}
            {syncInBuild && syncControl}
          </div>
        </div>
      </section>
    </div>
  );
}
