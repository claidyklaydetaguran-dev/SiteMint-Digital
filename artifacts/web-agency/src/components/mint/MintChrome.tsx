import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ROUTES, DASHBOARD_URLS } from "@/lib/routes";
import { RouteScrollManager } from "@/components/v5/RouteScrollManager";
import "./mint.css";
import "./mint-legacy.css";
import "./mint-scenes.css";

export function MintChrome({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => shellRef.current?.style.setProperty(
      "--mint-header-height", `${header.getBoundingClientRect().height}px`,
    );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const immersive = ["/", "/services", "/websites-apps", "/discovery-systems", "/ai-systems", "/ai-receptionist", "/about", "/process", "/work", "/insights"].includes(location);
  const menuRef = useRef<HTMLButtonElement>(null);
  const signinRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setOpen(false);
    if (signinRef.current) signinRef.current.open = false;
  }, [location]);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        signinRef.current &&
        !signinRef.current.contains(event.target as Node)
      ) {
        signinRef.current.open = false;
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  const navigation = [
    [ROUTES.services, "Services"],
    [ROUTES.aiReceptionist, "AI Receptionist"],
    [ROUTES.workV3, "Work"],
    [ROUTES.pricing, "Pricing"],
    [ROUTES.about, "About"],
  ] as const;
  return (
    <div ref={shellRef} className="mint-site" data-shell="public" data-chrome="mint" data-immersive={immersive}>
      <RouteScrollManager />
      <a className="skip" href="#main-content">
        Skip to content
      </a>
      <header ref={headerRef} data-scrolled={scrolled}>
        <Link className="logo" href={ROUTES.home}>
          <span className="mark" aria-hidden="true">
            s
          </span>
          SiteMint <small>Digital</small>
        </Link>
        <button
          ref={menuRef}
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="mint-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <nav
          id="mint-navigation"
          className={open ? "open" : ""}
          aria-label="Main navigation"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            if (signinRef.current?.open) {
              signinRef.current.open = false;
              signinRef.current.querySelector("summary")?.focus();
            } else if (open) {
              setOpen(false);
              menuRef.current?.focus();
            }
          }}
        >
          {navigation.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={location === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          <details
            ref={signinRef}
            className="mint-signin"
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                event.currentTarget.open = false;
              }
            }}
          >
            <summary>Sign in</summary>
            <div>
              <a href={DASHBOARD_URLS.login}>Receptionist workspace<small>Calls, appointments and your assistant</small></a>
              <a href="/portal/sign-in">Client portal<small>Your website project, files and support</small></a>
              <Link href={`${ROUTES.start}#contact`}>
                Need help signing in?
              </Link>
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
            <Link href={ROUTES.pricing}>Pricing</Link>
            <Link href={ROUTES.insights}>Insights</Link>
            <Link href={ROUTES.start}>Contact SiteMint</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} SiteMint Digital</span>
          <div>
            <Link href={ROUTES.privacy}>Privacy</Link> ·{" "}
            <Link href={ROUTES.terms}>Terms</Link>
            {" · "}
            <a href={ROUTES.adminLogin}>Staff sign in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
