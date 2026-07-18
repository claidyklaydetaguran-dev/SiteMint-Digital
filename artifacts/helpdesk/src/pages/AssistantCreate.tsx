import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { ASSISTANT_TEMPLATES, type AssistantTemplate } from "@/lib/assistantTemplates";
import { TemplateCard } from "@/components/common/TemplateCard";
import { useCreateAssistantDraft } from "@/hooks/useAssistantDrafts";

export default function AssistantCreate() {
  const [, navigate] = useLocation();
  const createDraft = useCreateAssistantDraft();

  const handleSelect = (template: AssistantTemplate) => {
    // Local-only: creates in-memory builder state, no API call, no persistence.
    const id = createDraft(template);
    navigate(`/assistants/${id}/setup`);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      <div className="flex-shrink-0 px-6 pb-5 pt-6">
        <Link
          href="/assistants"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Assistants
        </Link>
        <h1 className="mt-2 font-display text-xl font-semibold text-foreground">
          Choose a starting point
        </h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          Pick a template to prefill the builder, or start from a blank assistant. Nothing is
          saved until Checkpoint E — you can change everything before then.
        </p>
      </div>

      <div className="flex-1 px-6 pb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ASSISTANT_TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} onSelect={handleSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
