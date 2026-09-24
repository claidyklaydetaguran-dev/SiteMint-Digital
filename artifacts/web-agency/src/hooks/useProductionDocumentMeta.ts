import { useEffect } from "react";

const SITE_ORIGIN = "https://sitemintdigital.com";

/**
 * Sets document <title>, meta description, robots, and canonical URL for a
 * production route, restoring the prior values on unmount. Sibling to
 * usePlatformPreviewDocumentMeta — that hook fixes robots to
 * "noindex, nofollow" and strips the canonical link (preview pages are
 * never indexed); this one is for the same page components once they serve
 * real, indexed production routes: robots is "index, follow" and a
 * canonical link pointing at https://sitemintdigital.com is set/restored
 * instead of removed.
 */
export function useProductionDocumentMeta(title: string, description: string, canonicalPath: string) {
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

    setMeta("robots", "index, follow");
    setMeta("description", description);

    let canonicalTag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonicalHref = canonicalTag?.getAttribute("href") ?? null;
    let createdCanonical = false;
    if (!canonicalTag) {
      canonicalTag = document.createElement("link");
      canonicalTag.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalTag);
      createdCanonical = true;
    }
    canonicalTag.setAttribute("href", `${SITE_ORIGIN}${canonicalPath}`);

    return () => {
      document.title = previousTitle;
      createdTags.forEach((tag) => tag.remove());
      if (createdCanonical) {
        canonicalTag?.remove();
      } else if (previousCanonicalHref) {
        canonicalTag?.setAttribute("href", previousCanonicalHref);
      }
    };
  }, [title, description, canonicalPath]);
}
