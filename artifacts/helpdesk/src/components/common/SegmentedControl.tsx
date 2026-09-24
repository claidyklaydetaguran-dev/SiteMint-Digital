interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  "aria-label"?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  "aria-label": string;
  className?: string;
}

/** Small accessible segmented toggle (radiogroup semantics) — used for card/table and similar binary switches. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-lg border border-border bg-muted p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt["aria-label"] ?? opt.label}
            onClick={() => onChange(opt.value)}
            className={`inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
