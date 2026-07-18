import type { AssistantTemplate } from "@/lib/assistantTemplates";
import { Button } from "@/components/ui/button";

interface TemplateCardProps {
  template: AssistantTemplate;
  onSelect: (template: AssistantTemplate) => void;
}

/** One of eight template options in the assistant creation experience — original SiteMint styling. */
export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const Icon = template.icon;
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-muted text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="font-display text-base font-semibold text-foreground">{template.name}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{template.outcome}</p>

      <ul className="mt-3 space-y-1">
        {template.responsibilities.map((r) => (
          <li key={r} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] italic text-muted-foreground">{template.useCase}</p>

      <Button
        onClick={() => onSelect(template)}
        variant={template.id === "blank" ? "outline" : "default"}
        className="mt-4 h-9 w-full text-sm"
      >
        {template.id === "blank" ? "Start from blank" : "Select template"}
      </Button>
    </div>
  );
}
