/**
 * DiscoveryPage — public "Start a Project" intake form.
 *
 * This is the production route for /discovery. It renders the multi-step
 * guided form (PlatformDiscoveryShell) in the SiteMint design system,
 * with its own minimal branded header.
 *
 * W-9/W-11: on completion the brief is submitted to the real backend
 * (`POST /api/v1/discovery-submissions`, see
 * `components/platform-discovery/discoverySubmit.ts`), gated behind
 * `PUBLIC_FORM_SUBMISSIONS_ENABLED` server-side. Until then — and while
 * filling it in — answers are saved to localStorage only (draft persistence,
 * auto-cleared on a successful/duplicate submission or explicit start-over).
 *
 * ROLLBACK: to revert to the legacy form, change the /discovery route in
 * App.tsx back to `component={Discovery}` (the legacy component is kept at
 * /discovery/__legacy).
 */
import "@/styles/platform-preview.css";
import "@/components/platform-discovery/discovery-v5.css";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PlatformDiscoveryShell } from "@/components/platform-discovery/PlatformDiscoveryShell";
// Owner final polish (2026-09-06, Discovery brand repair): Discovery carries
// the SAME canonical brand as the public site chrome. Client-approved
// professional redesign (2026-09-09): that brand is now the typography-only
// BrandWordmark — the diamond mark is retired from public surfaces.
import { BrandWordmark } from "@/components/v5/BrandWordmark";

const PAGE_TITLE = "Start a Project — SiteMint Digital";
const PAGE_DESCRIPTION =
  "Tell us about your project. SiteMint will review your answers and prepare a personalized proposal and scope of work within 24–48 hours.";

export default function DiscoveryPage() {
  // Centralised per-route meta (title/description/canonical/OG) — the ad-hoc
  // title effect predated usePageMeta and left the canonical pointing at "/",
  // which the prerender workstream (2026-09-07) surfaced.
  usePageMeta({ title: PAGE_TITLE, description: PAGE_DESCRIPTION });

  return (
    <div className="platform-preview discovery-v5 flex min-h-[100dvh] flex-col bg-[hsl(var(--sm-color-bg-canvas))] text-[hsl(var(--sm-color-text-primary))]">
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
        <div className="mx-auto flex max-w-[76rem] items-center justify-between px-4 py-3 sm:px-6">
          <a href="/" aria-label="SiteMint. Digital — back to home" className="dsc-brand">
            <BrandWordmark />
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
