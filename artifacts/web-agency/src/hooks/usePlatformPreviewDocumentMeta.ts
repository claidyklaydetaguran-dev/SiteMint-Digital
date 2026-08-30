import { useEffect } from "react";

/**
 * Sets document <title>/meta for a preview route and restores the prior
 * values on unmount, so navigating away (e.g. via the app's own not-found
 * fallback when the flag is off) never leaves preview metadata behind on
 * another route. Extracted from the identical inline hooks that used to
 * live separately in PlatformPreview.tsx and PlatformDiscoveryPreview.tsx —
 * every /platform-preview page uses this one hook now. web-agency has no
 * per-route metadata system today; this remains a route-scoped stand-in,
 * not a new shared SEO mechanism.
 */
export function usePlatformPreviewDocumentMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

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
    setMeta("description", description);

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
  }, [title, description]);
}
