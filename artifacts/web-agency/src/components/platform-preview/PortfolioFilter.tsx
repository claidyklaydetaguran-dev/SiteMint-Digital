export function PortfolioFilter({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (category: string) => void;
}) {
  const options = ["All", ...categories];
  return (
    <div role="radiogroup" aria-label="Filter portfolio by category" className="flex flex-wrap justify-center gap-2">
      {options.map((option) => {
        const isActive = option === active;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(option)}
            className="rounded-[var(--sm-radius-pill)] border px-4 py-1.5 text-sm font-medium transition-all duration-200"
            style={{
              borderColor: isActive ? "hsl(var(--sm-mint-500))" : "hsl(var(--sm-color-border-default))",
              backgroundColor: isActive ? "hsl(var(--sm-mint-100))" : "transparent",
              color: isActive ? "hsl(var(--sm-color-action-primary))" : "hsl(var(--sm-color-text-secondary))",
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
