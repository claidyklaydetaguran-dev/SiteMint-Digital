/**
 * Frontend V5 — the on-brand public 404 (W-12, W-16). Plain explanation and
 * five real exits. Used only by the public catch-all in App.tsx; the admin
 * catch-all inside `AdminRoutes` keeps its own `NotFound` (V2) — that
 * subtree belongs to the Operations CRM owner.
 */

import { Link } from "wouter";
import { ROUTES, dashboardUrl } from "@/lib/routes";
import { usePageMeta } from "@/hooks/usePageMeta";

const EXITS = [
  { label: "Home", href: ROUTES.home, isRoute: true },
  { label: "What We Build", href: ROUTES.services, isRoute: true },
  { label: "AI Receptionist", href: ROUTES.aiReceptionist, isRoute: true },
  { label: "Start a Project", href: ROUTES.start, isRoute: true },
  { label: "Client Sign In", href: dashboardUrl("/login"), isRoute: false },
] as const;

export default function NotFoundV5() {
  usePageMeta({
    title: "Page not found — SiteMint Digital",
    description: "This page doesn't exist. Find your way back to SiteMint Digital.",
  });

  return (
    <section className="v4-section" data-tone="ink" style={{ minHeight: "60vh", display: "flex", alignItems: "center" }}>
      <div className="v4-container">
        <span className="v4-kicker">404</span>
        <h1 className="v4-h2">We couldn't find that page.</h1>
        <p className="v4-lede">
          The link may be out of date, or the page may have moved as part of
          a recent update to the site. Here's where you probably meant to go.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "1.5rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {EXITS.map((exit) =>
            exit.isRoute ? (
              <li key={exit.label}>
                <Link href={exit.href} className="v4-btn v4-btn--outline">
                  {exit.label}
                </Link>
              </li>
            ) : (
              <li key={exit.label}>
                <a href={exit.href} className="v4-btn v4-btn--outline">
                  {exit.label}
                </a>
              </li>
            ),
          )}
        </ul>
      </div>
    </section>
  );
}
