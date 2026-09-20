import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ROUTES, DASHBOARD_URLS } from "@/lib/routes";
import { RouteScrollManager } from "@/components/v5/RouteScrollManager";
import "./mint.css";
import "./mint-legacy.css";

export function MintChrome({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location]);
  return (
    <div className="mint-site" data-shell="public" data-chrome="mint">
      <RouteScrollManager />
      <a className="skip" href="#main-content">
        Skip to content
      </a>
      <header>
        <Link className="logo" href={ROUTES.home}>
          <span className="mark" aria-hidden="true">
            s
          </span>
          SiteMint <small>Digital</small>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="mint-navigation"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
        <nav
          id="mint-navigation"
          className={open ? "open" : ""}
          aria-label="Main navigation"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <Link href={ROUTES.services}>Services</Link>
          <Link href={ROUTES.aiReceptionist}>AI Receptionist</Link>
          <Link href={ROUTES.workV3}>Work</Link>
          <Link href={ROUTES.pricing}>Pricing</Link>
          <Link href={ROUTES.about}>About</Link>
          <details className="mint-signin">
            <summary>Sign in</summary>
            <div>
              <a href={DASHBOARD_URLS.login}>Receptionist workspace</a>
              <a href="/portal/sign-in">Client portal</a>
            </div>
          </details>
          <Link className="button compact" href={ROUTES.discovery}>
            Start a project
          </Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer>
        <div className="footer-top">
          <Link className="logo" href={ROUTES.home}>
            SiteMint <small>Digital</small>
          </Link>
          <p>
            A clearer website.
            <br />A more connected business.
          </p>
          <div>
            <Link href={ROUTES.services}>Our services</Link>
            <Link href={ROUTES.aiReceptionist}>AI Receptionist</Link>
            <Link href={ROUTES.process}>Our approach</Link>
            <Link href={ROUTES.start}>Contact SiteMint</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} SiteMint Digital</span>
          <div>
            <Link href={ROUTES.privacy}>Privacy</Link> ·{" "}
            <Link href={ROUTES.terms}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
