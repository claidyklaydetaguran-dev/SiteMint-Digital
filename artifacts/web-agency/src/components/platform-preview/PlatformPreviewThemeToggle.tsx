import { Moon, Sun } from "lucide-react";
import type { PlatformPreviewTheme } from "@/hooks/usePlatformPreviewTheme";

export function PlatformPreviewThemeToggle({
  theme,
  onToggle,
}: {
  theme: PlatformPreviewTheme;
  onToggle: () => void;
}) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-default))] text-[hsl(var(--sm-color-text-secondary))] transition-colors hover:bg-[hsl(var(--sm-color-surface-interactive))]"
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
