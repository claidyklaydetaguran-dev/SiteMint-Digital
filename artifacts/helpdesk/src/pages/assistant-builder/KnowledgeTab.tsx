import { FileText, Link2, HelpCircle, Building2 } from "lucide-react";
import { DisabledFeatureCard } from "@/components/common/DisabledFeatureCard";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

const SOURCES = [
  { icon: FileText, title: "Files", description: "Upload PDFs, docs, or spreadsheets for the assistant to reference." },
  { icon: Link2, title: "URLs", description: "Point the assistant at pages on your website." },
  { icon: HelpCircle, title: "FAQs", description: "Add question-and-answer pairs the assistant can draw on." },
  { icon: Building2, title: "Business information", description: "Hours, location, services, and policies." },
];

export default function KnowledgeTab(_props: BuilderTabProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Knowledge</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Reference material this assistant can draw on during a call.
        </p>
      </div>

      <div className="space-y-3">
        {SOURCES.map((source) => (
          <DisabledFeatureCard
            key={source.title}
            icon={source.icon}
            title={source.title}
            description={source.description}
            availability="Knowledge Base available in Milestone 4"
          />
        ))}
      </div>
    </div>
  );
}
