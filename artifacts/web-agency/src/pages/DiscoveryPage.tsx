/**
 * DiscoveryPage — public "Start a Project" intake form.
 *
 * This is the production route for /discovery. It renders the multi-step
 * guided form (PlatformDiscoveryShell) in the SiteMint design system,
 * with its own minimal branded header.
 *
 * The form is a preview-only flow: no submission is sent and no data is
 * stored server-side. Answers are saved to localStorage only (draft
 * persistence, auto-cleared on completion or explicit start-over).
 *
 * ROLLBACK: to revert to the legacy form, change the /discovery route in
 * App.tsx back to `component={Discovery}` (the legacy component is kept at
 * /discovery/__legacy).
 */
import "@/styles/platform-preview.css";
import { useEffect } from "react";
import { PlatformDiscoveryShell } from "@/components/platform-discovery/PlatformDiscoveryShell";
import { SiteMintLogo } from "@/components/SiteMintLogo";

const PAGE_TITLE = "Start a Project — SiteMint Digital";
const PAGE_DESCRIPTION =
  "Tell us about your project. SiteMint will review your answers and prepare a personalized proposal and scope of work within 24–48 hours.";

export default function DiscoveryPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = PAGE_TITLE;
    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? "";
    if (metaDesc) metaDesc.setAttribute("content", PAGE_DESCRIPTION);
    return () => {
      document.title = prev;
      if (metaDesc) metaDesc.setAttribute("content", prevDesc);
    };
  }, []);

  return (
    <div className="platform-preview flex min-h-[100dvh] flex-col bg-[hsl(var(--sm-color-bg-canvas))] text-[hsl(var(--sm-color-text-primary))]">
      <a href="#discovery-main-content" className="pp-skip-link">
        Skip to content
      </a>

      {/* Minimal branded header */}
      <header
        className="sticky top-0 z-10 border-b"
        style={{
          borderColor: "hsl(var(--sm-color-border-subtle))",
          backgroundColor: "hsl(var(--sm-color-bg-canvas))",
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="/" aria-label="SiteMint — back to home" className="flex items-center gap-2.5">
            <SiteMintLogo className="h-7 w-auto" />
          </a>
          <a
            href="/"
            className="text-sm text-[hsl(var(--sm-color-text-secondary))] hover:text-[hsl(var(--sm-color-text-primary))] transition-colors"
          >
            ← Back to home
          </a>
        </div>
      </header>

      <main id="discovery-main-content" className="flex-1">
        <PlatformDiscoveryShell />
      </main>

      <footer
        className="border-t py-4 text-center text-xs"
        style={{
          borderColor: "hsl(var(--sm-color-border-subtle))",
          color: "hsl(var(--sm-color-text-muted))",
        }}
      >
        © {new Date().getFullYear()} SiteMint Digital. Your information is kept private.
      </footer>
    </div>
  );
}
