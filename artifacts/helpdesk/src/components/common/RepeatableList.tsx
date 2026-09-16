import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RepeatableListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  itemPlaceholder?: string;
  addLabel?: string;
  maxItems?: number;
  itemMaxLength?: number;
  helpText?: string;
}

/**
 * A locally editable list of short strings (questions to ask, conversation
 * objectives). Presentation only: the shared `si-*` field classes and the
 * shared `Button`, so it matches every other field in the builder. Each row
 * keeps its own accessible name and its own 44px remove control.
 */
export function RepeatableList({
  label,
  items,
  onChange,
  itemPlaceholder = "Enter a value…",
  addLabel = "Add",
  maxItems = 10,
  itemMaxLength = 200,
  helpText,
}: RepeatableListProps) {
  const addItem = () => onChange([...items, ""]);
  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, value: string) =>
    onChange(items.map((v, idx) => (idx === i ? value : v)));

  const atLimit = items.length >= maxItems;

  return (
    <div className="si-field">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--sd-space-2, .5rem)",
        }}
      >
        <span className="si-label">{label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          disabled={atLimit}
          aria-label={`${addLabel} — ${label}`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {addLabel}
        </Button>
      </div>

      {helpText && <p className="si-hint">{helpText}</p>}

      {items.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: "var(--sd-space-4, 1rem)",
            border: "1px dashed var(--sd-border-strong, rgba(59,82,101,.24))",
            borderRadius: "var(--sd-radius-control, 6px)",
            background: "var(--sd-surface-alt, #f6fbfa)",
            fontSize: "var(--sd-text-small, .8125rem)",
            color: "var(--sd-text-muted, #3b5265)",
          }}
        >
          Nothing added yet.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sd-space-2, .5rem)",
          }}
        >
          {items.map((item, i) => (
            <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "var(--sd-space-2, .5rem)" }}>
              <input
                className="si-input"
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                placeholder={`${itemPlaceholder} ${i + 1}`}
                maxLength={itemMaxLength}
                aria-label={`${label} item ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label={`Remove ${label.toLowerCase()} item ${i + 1}`}
                style={{
                  flex: "0 0 auto",
                  width: 44,
                  height: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--sd-border, rgba(59,82,101,.12))",
                  borderRadius: "var(--sd-radius-control, 6px)",
                  background: "var(--sd-surface, #fff)",
                  color: "var(--sd-text-muted, #3b5265)",
                  cursor: "pointer",
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {atLimit && <p className="si-hint">That&rsquo;s the maximum of {maxItems}. Remove one to add another.</p>}
    </div>
  );
}
