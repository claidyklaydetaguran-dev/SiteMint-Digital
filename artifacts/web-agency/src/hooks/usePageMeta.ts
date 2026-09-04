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

export function usePageMeta({ title, description }: PageMeta): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const metaDesc = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const prevDesc = metaDesc?.getAttribute("content") ?? "";
    if (metaDesc) metaDesc.setAttribute("content", description);

    return () => {
      document.title = prevTitle;
      if (metaDesc) metaDesc.setAttribute("content", prevDesc);
    };
  }, [title, description]);
}

export default usePageMeta;
