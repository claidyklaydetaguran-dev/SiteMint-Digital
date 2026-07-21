import { useEffect } from "react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewTheme } from "@/hooks/usePlatformPreviewTheme";
import { PlatformDiscoveryShell } from "@/components/platform-discovery/PlatformDiscoveryShell";

const PREVIEW_TITLE = "Start Your Project — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished preview of a guided project intake experience. Not indexed, not linked publicly, and not connected to any live submission process.";

/**
 * Sets document <title>/meta for this route only, restoring the prior
 * values on unmount. Mirrors PlatformPreview.tsx's usePreviewDocumentMeta —
 * web-agency has no per-route metadata system today.
 */
function usePreviewDocumentMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PREVIEW_TITLE;

    const createdTags: HTMLMetaElement[] = [];

    function setMeta(name: string, content: string) {
      let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
        createdTags.push(tag);
      }
      tag.setAttribute("content", content);
    }

    setMeta("robots", "noindex, nofollow");
    setMeta("description", PREVIEW_DESCRIPTION);

    const previousCanonical = document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
    document.head.querySelector('link[rel="canonical"]')?.remove();

    return () => {
      document.title = previousTitle;
      createdTags.forEach((tag) => tag.remove());
      if (previousCanonical) {
        const canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        canonical.setAttribute("href", previousCanonical);
        document.head.appendChild(canonical);
      }
    };
  }, []);
}

export default function PlatformDiscoveryPreview() {
  usePreviewDocumentMeta();
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
