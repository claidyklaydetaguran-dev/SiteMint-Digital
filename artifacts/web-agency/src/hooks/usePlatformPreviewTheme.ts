import { useCallback, useEffect, useState } from "react";

/**
 * Minimum preview-scoped theme mechanism for /platform-preview only.
 *
 * web-agency has no wired theme provider today (its `.dark` CSS block is
 * dead code — see docs/sitemint-platform/DESIGN_TOKEN_AUDIT.md §11). Rather
 * than wiring a platform-wide theme system in this checkpoint, this hook
 * implements a transitional, namespaced, preview-only mechanism: it applies
 * a `dark` class to the prototype's own root element only (never
 * `<html>`/`<body>`), so it cannot affect any other route. The long-term
 * direction remains one shared public-site theme system (see
 * SHARED_DESIGN_TOKENS_SPEC.md "Theme Strategy") — this is a documented
 * stand-in scoped to Checkpoint 2A.
 */

export type PlatformPreviewTheme = "light" | "dark";

const STORAGE_KEY = "sitemint-platform-preview-theme";

function resolveInitialTheme(): PlatformPreviewTheme {
  if (typeof window === "undefined") return "light";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be unavailable (private mode); fall through to OS preference.
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function usePlatformPreviewTheme() {
  const [theme, setTheme] = useState<PlatformPreviewTheme>(resolveInitialTheme);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Non-fatal — theme still applies for this session.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggleTheme };
}
