import { useEffect } from "react";

/**
 * Per-route `<title>` / meta-description (W-15). Same restore-on-unmount
 * pattern already used ad hoc in `DiscoveryPage.tsx` — centralised here so
 * every V5 page sets its own title/description consistently instead of
 * re-implementing the effect.
 */
export interface PageMeta {
  /** Full `<title>` text, e.g. "Pricing — SiteMint Digital". */
  title: string;
  description: string;
}

/** Production origin — the canonical host (release directive 2026-09-07). */
const CANONICAL_ORIGIN = "https://sitemintdigital.com";

export function usePageMeta({ title, description }: PageMeta): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const metaDesc = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const prevDesc = metaDesc?.getAttribute("content") ?? "";
    if (metaDesc) metaDesc.setAttribute("content", description);

    // Per-route canonical (release directive): the SPA's static canonical
    // pointed every route at "/"; each page now claims its own URL on the
    // canonical apex host.
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const prevCanonical = canonical?.getAttribute("href") ?? "";
    if (canonical) {
      const path = window.location.pathname.replace(/\/$/, "");
      canonical.setAttribute("href", `${CANONICAL_ORIGIN}${path || "/"}`);
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc) metaDesc.setAttribute("content", prevDesc);
      if (canonical && prevCanonical) canonical.setAttribute("href", prevCanonical);
    };
  }, [title, description]);
}

export default usePageMeta;
