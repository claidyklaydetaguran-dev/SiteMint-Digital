import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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

/** Locally editable repeatable list of short strings (objectives, info to collect, etc). */
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

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-primary"
          onClick={addItem}
          disabled={items.length >= maxItems}
          aria-label={`${addLabel} — ${label}`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
      {helpText && <p className="mb-2 text-[11px] text-muted-foreground">{helpText}</p>}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-5 text-center text-xs text-muted-foreground">
          Nothing added yet
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                placeholder={`${itemPlaceholder} ${i + 1}`}
                maxLength={itemMaxLength}
                aria-label={`${label} item ${i + 1}`}
                className="h-9 flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label={`Remove ${label.toLowerCase()} item ${i + 1}`}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover-elevate hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
