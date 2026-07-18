import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, PlayCircle, Rocket, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BuilderNotice } from "@/components/common/BuilderNotice";
import { CostBreakdown } from "@/components/common/CostBreakdown";
import { LatencyMeter } from "@/components/common/LatencyMeter";
import { EmptyState } from "@/components/common/EmptyState";
import { UnavailableActionButton } from "@/components/common/UnavailableActionButton";
import { getVoicePreset } from "@/lib/assistantEstimates";
import { useAssistantDraft, type AssistantDraft } from "@/hooks/useAssistantDrafts";
import { Bot } from "lucide-react";

import SetupTab from "@/pages/assistant-builder/SetupTab";
import PromptTab from "@/pages/assistant-builder/PromptTab";
import VoiceModelTab from "@/pages/assistant-builder/VoiceModelTab";
import ToolsTab from "@/pages/assistant-builder/ToolsTab";
import KnowledgeTab from "@/pages/assistant-builder/KnowledgeTab";
import TestingTab from "@/pages/assistant-builder/TestingTab";
import AnalysisTab from "@/pages/assistant-builder/AnalysisTab";
import AdvancedTab from "@/pages/assistant-builder/AdvancedTab";

const TABS = [
  { key: "setup", label: "Setup" },
  { key: "prompt", label: "Prompt" },
  { key: "voice-model", label: "Voice & Model" },
  { key: "tools", label: "Tools" },
  { key: "knowledge", label: "Knowledge" },
  { key: "testing", label: "Testing" },
  { key: "analysis", label: "Analysis" },
  { key: "advanced", label: "Advanced" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export interface BuilderTabProps {
  draft: AssistantDraft;
  update: (updater: (draft: AssistantDraft) => AssistantDraft) => void;
}

function TabPanel({ tab, draft, update }: { tab: TabKey } & BuilderTabProps) {
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

export default function AssistantBuilder() {
  const params = useParams<{ id: string; tab?: string }>();
  const [, navigate] = useLocation();
  const { id } = params;
  const tab: TabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "setup") as TabKey;
  const { draft, update } = useAssistantDraft(id);

  useEffect(() => {
    if (!params.tab) {
      navigate(`/assistants/${id}/setup`, { replace: true });
    }
  }, [params.tab, id, navigate]);

  if (!draft) {
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

  const preset = getVoicePreset(draft.voiceModel.preset);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
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
              className="h-9 max-w-xs text-sm font-semibold"
            />
            <Badge variant="secondary" className="flex-shrink-0 text-xs font-medium">
              Draft · Not Saved
            </Badge>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <UnavailableActionButton
              icon={PlayCircle}
              label="Test"
              availability="Browser test calling available in Checkpoint F."
            />
            <UnavailableActionButton
              icon={Rocket}
              label="Publish"
              availability="Publishing available in Checkpoint E."
            />
          </div>
        </div>
        <BuilderNotice className="mt-3" />
      </div>

      {/* Tabs + content */}
      <Tabs
        value={tab}
        onValueChange={(v) => navigate(`/assistants/${id}/${v}`)}
        className="flex min-h-0 flex-1 flex-col md:flex-row"
      >
        <div className="relative flex-shrink-0 md:w-48">
          <TabsList
            aria-label="Assistant builder sections"
            className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-2 md:w-48 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3"
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="w-auto min-h-11 shrink-0 justify-start whitespace-nowrap rounded-lg px-3 py-2 text-sm data-[state=active]:bg-surface-muted data-[state=active]:text-primary data-[state=active]:shadow-none md:w-full"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Mobile-only edge fade — hints that the tab strip scrolls */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden"
          />
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <TabPanel tab={tab} draft={draft} update={update} />
        </div>
      </Tabs>

      {/* Sticky estimate summary */}
      <div className="flex-shrink-0 border-t border-border bg-card px-6 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-4 sm:flex sm:gap-8">
            <CostBreakdown preset={preset} compact />
            <LatencyMeter latencyMs={preset.latencyMs} compact />
          </div>
          <UnavailableActionButton
            icon={Save}
            label="Save Draft"
            availability="Saving available in Checkpoint E"
          />
        </div>
      </div>
    </div>
  );
}
