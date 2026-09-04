/**
 * Frontend V4 — the Signal public footer. The signal-gradient rule runs
 * along its top edge (the thread completing the page). Link inventory
 * mirrors the approved navigation model; no invented destinations.
 */

import { Link } from "wouter";
import { ROUTES } from "@/lib/routes";
import { SignalMarkV4 } from "./SignalMarkV4";
import {
  primaryNavV4,
  signInHrefV4,
  signInLabelV4,
  startHrefV4,
  whatWeBuildV4,
} from "./publicNavV4";

export function SiteFooterV4() {
  return (
    <footer className="v4-footer">
      <div className="v4-footer__inner">
        <div>
          <Link
            href="/"
            className="v4-footer__brand"
            aria-label="SiteMint Digital — home"
          >
            <SignalMarkV4 size={20} />
            SiteMint
          </Link>
          <p className="v4-footer__tag">
            Websites, web apps, CRM systems, AI automation, and custom
            software — designed as one connected system.
          </p>
        </div>

        <div className="v4-footer__cols">
          <div className="v4-footer__col">
            <span className="v4-footer__col-title">What We Build</span>
            {whatWeBuildV4.map((item) => (
              <Link key={item.label} href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="v4-footer__col">
            <span className="v4-footer__col-title">Company</span>
            {/* Route-aware section anchor: navigates to the homepage and then
                scrolls to the journey chapter (useHashScrollV4). The anchor
                id itself (#signal-journey) is an internal contract name and
                stays — only the visible brand-hygiene copy changes (W-1). */}
            <Link href="/#signal-journey">How the system connects</Link>
            {primaryNavV4.map((item) => (
              <Link key={item.label} href={item.href}>
                {item.label}
              </Link>
            ))}
            <Link href={startHrefV4}>Start a Project</Link>
            <a href={signInHrefV4}>{signInLabelV4}</a>
          </div>
          <div className="v4-footer__col">
            <span className="v4-footer__col-title">Legal</span>
            <Link href={ROUTES.privacy}>Privacy</Link>
            <Link href={ROUTES.terms}>Terms</Link>
          </div>
        </div>

        <div className="v4-footer__legal">
          <span>© {new Date().getFullYear()} SiteMint Digital</span>
          {/* W-1 amended brand line — "From first click to booked customer"
              is reserved for lead-generation / AI Receptionist contexts. */}
          <span>Capture. Organize. Connect. Resolve.</span>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooterV4;
