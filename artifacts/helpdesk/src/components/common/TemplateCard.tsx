import type { AssistantTemplate } from "@/lib/assistantTemplates";
import { Button } from "@/components/ui/button";
import { CREATE } from "@/pages/assistants/assistantsContract";

interface TemplateCardProps {
  template: AssistantTemplate;
  onSelect: (template: AssistantTemplate) => void;
}

/**
 * One starting point in the assistant creation experience, rendered as a row
 * of the shared `sd-list` rather than as a card in a grid of its own — the
 * same shape Settings uses for its configuration destinations, so the picker
 * reads as part of the dashboard.
 *
 * Selecting one only prefills local builder state; nothing is created or
 * saved, which is what the copy says.
 */
export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const Icon = template.icon;
  const titleId = `template-${template.id}-title`;

  return (
    <li className="sd-list__item">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: "var(--sd-space-4, 1rem)",
          padding: "var(--sd-space-4, 1rem)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "var(--sd-radius-control, 6px)",
            background: "var(--sd-surface-accent, #f0f9f6)",
            color: "var(--sd-accent-ink, #051824)",
          }}
        >
          <Icon className="sd-navlink__icon" />
        </span>

        <div style={{ flex: "1 1 18rem", minWidth: 0 }}>
          <h3 className="sd-h2" id={titleId}>
            {template.name}
          </h3>
          <p
            style={{
              margin: "var(--sd-space-1, .25rem) 0 0",
              fontSize: "var(--sd-text-small, .8125rem)",
              lineHeight: 1.55,
              color: "var(--sd-text-muted, #3b5265)",
            }}
          >
            {template.outcome}
          </p>

          <ul
            style={{
              listStyle: "none",
              margin: "var(--sd-space-3, .75rem) 0 0",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--sd-space-1, .25rem)",
            }}
          >
            {template.responsibilities.map((r) => (
              <li
                key={r}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "var(--sd-space-2, .5rem)",
                  fontSize: "var(--sd-text-small, .8125rem)",
                  lineHeight: 1.5,
                  color: "var(--sd-text-muted, #3b5265)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flex: "0 0 auto",
                    width: 4,
                    height: 4,
                    marginTop: 8,
                    borderRadius: "50%",
                    background: "var(--sd-accent, #27e9b5)",
                  }}
                />
                <span style={{ minWidth: 0 }}>{r}</span>
              </li>
            ))}
          </ul>

          <p
            style={{
              margin: "var(--sd-space-3, .75rem) 0 0",
              fontSize: "var(--sd-text-small, .8125rem)",
              lineHeight: 1.5,
              color: "var(--sd-text-muted, #3b5265)",
            }}
          >
            {template.useCase}
          </p>
        </div>

        <div style={{ flex: "0 0 auto" }}>
          <Button
            onClick={() => onSelect(template)}
            variant={template.id === "blank" ? "outline" : "default"}
            aria-describedby={titleId}
          >
            {template.id === "blank" ? CREATE.startBlank : CREATE.select}
          </Button>
        </div>
      </div>
    </li>
  );
}
