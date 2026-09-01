/**
 * Frontend V3 — the comprehensive public footer.
 *
 * Ink surface, four link columns, legal row. Every path comes from the
 * centralised route layer; Sign in stays a cross-application document
 * navigation. No invented social profiles, badges, or claims.
 */

import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { SiteMintMarkV3 } from "./SiteMintMarkV3";
import { servicesNavItems, signInHrefV3, startHrefV3, startLabelV3 } from "./publicNavV3";

const companyLinks = [
  { label: "Work", href: ROUTES.workV3 },
  { label: "Process", href: ROUTES.process },
  { label: "About", href: ROUTES.about },
  { label: "Insights", href: ROUTES.insights },
];

const beginLinks = [
  { label: startLabelV3, href: startHrefV3 },
  { label: "Start a discovery brief", href: ROUTES.discovery },
  { label: "Contact", href: ROUTES.contact },
];

export function SiteFooterV3() {
  const year = new Date().getFullYear();

  return (
    <footer className="v3-footer" data-tone="ink">
      <div className="v3-container v3-footer__inner">
        <div className="v3-footer__brand-col">
          <SiteMintMarkV3 size={32} />
          <p className="v3-footer__tagline">
            Websites, applications, and intelligent workflows — designed as one
            system that keeps your business moving.
          </p>
          <Link href={startHrefV3} className="v3-btn v3-btn--primary">
            {startLabelV3}
          </Link>
        </div>

        <nav className="v3-footer__col" aria-label="Services">
          <h2 className="v3-footer__heading">Services</h2>
          <ul className="v3-footer__list">
            {servicesNavItems.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="v3-footer__link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="v3-footer__col" aria-label="Company">
          <h2 className="v3-footer__heading">Company</h2>
          <ul className="v3-footer__list">
            {companyLinks.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="v3-footer__link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="v3-footer__col" aria-label="Get started">
          <h2 className="v3-footer__heading">Get started</h2>
          <ul className="v3-footer__list">
            {beginLinks.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="v3-footer__link">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              {/* Cross-application document navigation — never a <Link>. */}
              <a href={signInHrefV3} className="v3-footer__link">
                Customer sign in
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="v3-container v3-footer__legal">
        <p className="v3-footer__copyright">
          © {year} SiteMint Digital. All rights reserved.
        </p>
        <ul className="v3-footer__legal-list">
          <li>
            <Link href={ROUTES.privacy} className="v3-footer__link">
              Privacy
            </Link>
          </li>
          <li>
            <Link href={ROUTES.terms} className="v3-footer__link">
              Terms
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export default SiteFooterV3;
