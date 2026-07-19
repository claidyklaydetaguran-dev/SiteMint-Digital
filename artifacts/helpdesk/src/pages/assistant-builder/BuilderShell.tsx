import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, PlayCircle, Rocket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { UnavailableActionButton } from "@/components/common/UnavailableActionButton";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { getVoicePreset } from "@/lib/assistantEstimates";
import type { AssistantDraft } from "@/hooks/useAssistantDrafts";

import SetupTab from "@/pages/assistant-builder/SetupTab";
import PromptTab from "@/pages/assistant-builder/PromptTab";
import VoiceModelTab from "@/pages/assistant-builder/VoiceModelTab";
import ToolsTab from "@/pages/assistant-builder/ToolsTab";
import KnowledgeTab from "@/pages/assistant-builder/KnowledgeTab";
import TestingTab from "@/pages/assistant-builder/TestingTab";
import AnalysisTab from "@/pages/assistant-builder/AnalysisTab";
import AdvancedTab from "@/pages/assistant-builder/AdvancedTab";

export const BUILDER_TABS = [
  { key: "setup", label: "Setup" },
  { key: "prompt", label: "Prompt" },
  { key: "voice-model", label: "Voice & Model" },
  { key: "tools", label: "Tools" },
  { key: "knowledge", label: "Knowledge" },
  { key: "testing", label: "Testing" },
  { key: "analysis", label: "Analysis" },
  { key: "advanced", label: "Advanced" },
] as const;

export type BuilderTabKey = (typeof BUILDER_TABS)[number]["key"];

export function isBuilderTabKey(value: string | undefined): value is BuilderTabKey {
  return BUILDER_TABS.some((t) => t.key === value);
}

export interface BuilderTabProps {
  draft: AssistantDraft;
  update: (updater: (draft: AssistantDraft) => AssistantDraft) => void;
}

function TabPanel({ tab, draft, update }: { tab: BuilderTabKey } & BuilderTabProps) {
  switch (tab) {
    case "setup":
      return <SetupTab draft={draft} update={update} />;
    case "prompt":
      return <PromptTab draft={draft} update={update} />;
    case "voice-model":
      return <VoiceModelTab draft={draft} update={update} />;
    case "tools":
      return <ToolsTab draft={draft} update={update} />;
    case "knowledge":
      return <KnowledgeTab draft={draft} update={update} />;
    case "testing":
      return <TestingTab draft={draft} update={update} />;
    case "analysis":
      return <AnalysisTab draft={draft} update={update} />;
    case "advanced":
      return <AdvancedTab draft={draft} update={update} />;
    default:
      return null;
  }
}

interface BuilderShellProps extends BuilderTabProps {
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
 * eight builder tabs, and the sticky estimate/save footer. Only the parts
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
  contentDisabled = false,
}: BuilderShellProps) {
  const preset = getVoicePreset(draft.voiceModel.preset);

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
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Input
              aria-label="Assistant name"
              value={draft.setup.assistantName}
              onChange={(e) =>
                update((d) => ({ ...d, setup: { ...d.setup, assistantName: e.target.value } }))
              }
              placeholder="Untitled assistant"
              maxLength={100}
              disabled={contentDisabled}
              className="h-9 max-w-xs text-sm font-semibold"
            />
            <Badge variant="secondary" className="flex-shrink-0 text-xs font-medium">
              {statusBadge}
            </Badge>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <UnavailableActionButton
              icon={PlayCircle}
              label="Test"
              availability="Browser test calling available in Checkpoint F."
            />
            {publishControl ?? (
              <UnavailableActionButton
                icon={Rocket}
                label="Publish"
                availability="Publishing available in Checkpoint E3."
              />
            )}
          </div>
        </div>
        {headerBanner && <div className="mt-3">{headerBanner}</div>}
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
            <TabPanel tab={tab} draft={draft} update={update} />
          </fieldset>
        </div>
      </Tabs>

      {/* Sticky estimate summary + save */}
      <div className="flex-shrink-0 border-t border-border bg-card px-6 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-4 sm:flex sm:gap-8">
            <CostBreakdown preset={preset} compact />
            <LatencyMeter latencyMs={preset.latencyMs} compact />
          </div>
          {footerRight}
        </div>
      </div>
    </div>
  );
}
