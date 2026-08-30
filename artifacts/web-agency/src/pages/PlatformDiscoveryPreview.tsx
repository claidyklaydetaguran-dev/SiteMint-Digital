import "@/styles/platform-preview.css";
import { usePlatformPreviewTheme } from "@/hooks/usePlatformPreviewTheme";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformDiscoveryShell } from "@/components/platform-discovery/PlatformDiscoveryShell";

const PREVIEW_TITLE = "Start Your Project — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished preview of a guided project intake experience. Not indexed, not linked publicly, and not connected to any live submission process.";

export default function PlatformDiscoveryPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);
  const { theme } = usePlatformPreviewTheme();

  return (
    <div
      className={`platform-preview flex min-h-[100dvh] flex-col bg-[hsl(var(--sm-color-bg-canvas))] text-[hsl(var(--sm-color-text-primary))] ${theme === "dark" ? "dark" : ""}`}
    >
      <a href="#pp-discovery-main-content" className="pp-skip-link">
        Skip to content
      </a>

      <main id="pp-discovery-main-content" className="flex-1">
        <PlatformDiscoveryShell />
      </main>
    </div>
  );
}
