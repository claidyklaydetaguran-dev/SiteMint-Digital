import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { ASSISTANT_TEMPLATES, type AssistantTemplate } from "@/lib/assistantTemplates";
import { TemplateCard } from "@/components/common/TemplateCard";
import { CREATE, LIST_PATH, NEW_PATH } from "@/pages/assistants/assistantsContract";

export default function AssistantCreate() {
  const [, navigate] = useLocation();

  const handleSelect = (template: AssistantTemplate) => {
    // Local-only: no API call, no persisted row. The assistant is created
    // only when Save Draft is activated in the builder.
    navigate(`${NEW_PATH}/setup?templateKey=${encodeURIComponent(template.id)}`);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
      <div className="flex-shrink-0 px-6 pb-5 pt-6">
        <Link
          href={LIST_PATH}
          className="inline-flex min-h-11 items-center gap-1.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-0 md:py-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {CREATE.back}
        </Link>
        <h1 className="mt-2 font-display text-xl font-semibold text-foreground">
          {CREATE.title}
        </h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          {CREATE.detail}
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
