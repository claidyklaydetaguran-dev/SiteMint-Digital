/**
 * Frontend V2 Phase 2 — the shared public footer. Deep navy: one of the two
 * navy surfaces the homepage is allowed (INFORMATION-ARCHITECTURE.md §2).
 *
 * **Everything here is verified.** The email address, telephone number, and
 * region are the values already published in the Organization JSON-LD block in
 * `artifacts/web-agency/index.html`; the navigation mirrors `publicNav.ts`; the
 * service names mirror the Solutions menu.
 *
 * Deliberately absent, because nothing in the repository substantiates them:
 * social accounts (the JSON-LD `sameAs` array is empty), a street address,
 * awards, partner or client logos, certifications, and any legal page that has
 * no route — a Privacy or Terms link is only rendered once such a page exists.
 */

import { Link } from "wouter";
import { Mail, Phone } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { ROUTES } from "@/lib/routes";
import {
  primaryNavItems,
  solutionsNavItems,
  startProjectHref,
  startProjectLabel,
} from "./publicNav";

/** Verified in index.html's Organization JSON-LD. */
const CONTACT_EMAIL = "info.sitemint@gmail.com";
const CONTACT_TEL_E164 = "+19498806515";
const CONTACT_TEL_DISPLAY = "+1 (949) 880-6515";
const CONTACT_REGION = "California, United States";

const flatNavItems = primaryNavItems.filter((item) => item.href);

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="v2-footer">
      <div className="v2-footer__inner">
        <div className="v2-footer__brand">
          <SiteMintLogo variant="light" iconSize={30} />
          <p className="v2-footer__blurb">
            SiteMint builds websites, apps, CRM workflows, and AI receptionists
            that work together as one system.
          </p>
          <Link href={startProjectHref} className="v2-btn v2-btn--primary">
            {startProjectLabel}
          </Link>
        </div>

        <nav className="v2-footer__cols" aria-label="Footer">
          <div className="v2-footer__col">
            <h2 className="v2-footer__heading">Navigate</h2>
            <ul className="v2-footer__list">
              {flatNavItems.map((item) => (
                <li key={item.label}>
                  <Link href={item.href!} className="v2-footer__link">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="v2-footer__col">
            <h2 className="v2-footer__heading">Solutions</h2>
            <ul className="v2-footer__list">
              {solutionsNavItems.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="v2-footer__link">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="v2-footer__col">
            <h2 className="v2-footer__heading">Contact</h2>
            <ul className="v2-footer__list">
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="v2-footer__link">
                  <Mail aria-hidden="true" className="v2-footer__icon" />
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a href={`tel:${CONTACT_TEL_E164}`} className="v2-footer__link">
                  <Phone aria-hidden="true" className="v2-footer__icon" />
                  {CONTACT_TEL_DISPLAY}
                </a>
              </li>
              <li className="v2-footer__plain">{CONTACT_REGION}</li>
              <li>
                <Link href={ROUTES.contact} className="v2-footer__link">
                  Send a message
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="v2-footer__base">
        <p>© {year} SiteMint Digital. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default SiteFooter;
