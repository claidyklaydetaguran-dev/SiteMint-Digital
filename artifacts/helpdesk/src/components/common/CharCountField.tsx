import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface CharCountFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  helpText?: string;
  multiline?: boolean;
  rows?: number;
}

/** Labeled field with a live-announced character counter — used for long prompt fields. */
export function CharCountField({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  helpText,
  multiline = true,
  rows = 4,
}: CharCountFieldProps) {
  const len = value.length;
  const overLimit = len > maxLength;
  const nearLimit = !overLimit && len >= Math.floor(maxLength * 0.85);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {label}
        </label>
        <span
          aria-live="polite"
          className={`text-[11px] tabular-nums ${
            overLimit ? "font-semibold text-destructive" : nearLimit ? "text-warning" : "text-muted-foreground"
          }`}
        >
          {len}/{maxLength}
        </span>
      </div>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={rows}
          className="resize-none text-sm"
          aria-describedby={helpText ? `${id}-help` : undefined}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          className="h-9 text-sm"
          aria-describedby={helpText ? `${id}-help` : undefined}
        />
      )}
      {helpText && (
        <p id={`${id}-help`} className="mt-1 text-[11px] text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  );
}
