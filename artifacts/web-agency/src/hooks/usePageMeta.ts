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
  /**
   * Canonical path when it is NOT the current URL — for a page reachable at
   * more than one path. `/work` is also served at the legacy `/portfolio`;
   * without this both claimed themselves and duplicated each other.
   */
  canonicalPath?: string;
}

/** Production origin — the canonical host (release directive 2026-09-07). */
const CANONICAL_ORIGIN = "https://sitemintdigital.com";

export function usePageMeta({ title, description, canonicalPath }: PageMeta): void {
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
      const path = (canonicalPath ?? window.location.pathname).replace(/\/$/, "");
      canonical.setAttribute("href", `${CANONICAL_ORIGIN}${path || "/"}`);
    }

    // Route-specific social meta (prerender workstream, 2026-09-07): the
    // static head carries homepage OG/Twitter copy; each route re-points
    // title/description/url so the prerendered snapshot of every route
    // ships correct social tags. Restored on unmount like the rest.
    const sync = (selector: string, value: string): (() => void) => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) return () => {};
      const prev = el.getAttribute("content") ?? "";
      el.setAttribute("content", value);
      return () => el.setAttribute("content", prev);
    };
    const path = window.location.pathname.replace(/\/$/, "");
    const restores = [
      sync('meta[property="og:title"]', title),
      sync('meta[property="og:description"]', description),
      sync('meta[property="og:url"]', `${CANONICAL_ORIGIN}${path || "/"}`),
      sync('meta[name="twitter:title"]', title),
      sync('meta[name="twitter:description"]', description),
    ];

    return () => {
      document.title = prevTitle;
      if (metaDesc) metaDesc.setAttribute("content", prevDesc);
      if (canonical && prevCanonical) canonical.setAttribute("href", prevCanonical);
      for (const restore of restores) restore();
    };
  }, [title, description, canonicalPath]);
}

export default usePageMeta;
