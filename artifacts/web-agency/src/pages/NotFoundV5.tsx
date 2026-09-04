/**
 * Frontend V5 — the on-brand public 404 (W-12, W-16). Plain explanation and
 * five real exits. Used only by the public catch-all in App.tsx; the admin
 * catch-all inside `AdminRoutes` keeps its own `NotFound` (V2) — that
 * subtree belongs to the Operations CRM owner.
 */

import { Link } from "wouter";
import { ROUTES, dashboardUrl } from "@/lib/routes";
import { useReveal } from "@/components/v3/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import "@/styles/v5-pages.css";

const EXITS = [
  { label: "Home", href: ROUTES.home, isRoute: true },
  { label: "Build Your SiteMint System", href: ROUTES.start, isRoute: true },
  { label: "What We Build", href: ROUTES.services, isRoute: true },
  { label: "AI Receptionist", href: ROUTES.aiReceptionist, isRoute: true },
  { label: "Client Sign In", href: dashboardUrl("/login"), isRoute: false },
] as const;

/** A small composed mark, not a blank grey box, above the 404 headline. */
function NotFoundMark() {
  return (
    <svg
      className="sm-notfound__mark"
      viewBox="0 0 64 64"
      role="img"
      aria-label="A disconnected path — the page you followed doesn't lead anywhere"
    >
      <circle cx="14" cy="46" r="4" fill="var(--sm-mint-400, #56D2CF)" />
      <circle cx="50" cy="18" r="4" fill="none" stroke="var(--sm-mint-400, #56D2CF)" strokeWidth="1.6" />
      <path
        d="M14 46 C 26 40, 30 30, 40 26"
        fill="none"
        stroke="var(--sm-mint-400, #56D2CF)"
        strokeWidth="1.6"
        strokeDasharray="4 5"
        opacity="0.85"
      />
      <path
        d="M46 22 L50 18 M50 18 L54 22 M50 18 L50 26"
        fill="none"
        stroke="var(--sm-mint-400, #56D2CF)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function NotFoundV5() {
  const reveal = useReveal();
  usePageMeta({
    title: "Page not found — SiteMint Digital",
    description: "This page doesn't exist. Find your way back to SiteMint Digital.",
  });

  return (
    <section className="v4-section sm-v5page sm-notfound" data-tone="ink">
      <div className="v4-container" ref={reveal} data-v4-reveal>
        <div className="reveal-scale-settle">
          <NotFoundMark />
        </div>
        <span className="v4-kicker reveal-fade-up">404</span>
        {/* Headline is this page's LCP text — left static (no mask-reveal) so
            first paint isn't delayed; the mark/kicker/lede/exits carry the
            motion. */}
        <h1 className="v4-h2">We couldn't find that page.</h1>
        <p className="v4-lede reveal-fade-up">
          The link may be out of date, or the page may have moved as part of
          a recent update to the site. Here's where you probably meant to go.
        </p>
        <ul className="sm-notfound__exits">
          {EXITS.map((exit) =>
            exit.isRoute ? (
              <li className="reveal-scale-settle" key={exit.label}>
                <Link href={exit.href} className="v4-btn v4-btn--outline">
                  {exit.label}
                </Link>
              </li>
            ) : (
              <li className="reveal-scale-settle" key={exit.label}>
                <a href={exit.href} className="v4-btn v4-btn--outline">
                  {exit.label}
                </a>
              </li>
            ),
          )}
        </ul>
        <p className="sm-notfound__hint reveal-fade-up">
          Still stuck? Every page on sitemintdigital.com is reachable from the
          navigation above, or you can{" "}
          <Link href={ROUTES.start}>tell us what you were looking for</Link>{" "}
          and we'll point you the right way.
        </p>
      </div>
    </section>
  );
}
