import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ROUTES, DASHBOARD_URLS } from "@/lib/routes";
import { RouteScrollManager } from "@/components/v5/RouteScrollManager";
import { restartAtTop, settleRestartAtTop } from "@/lib/scrollBehavior";
import "./mint.css";
import "./mint-legacy.css";
import "./mint-scenes.css";
import "./mint-refinement.css";
import "./mint-finish.css";

/**
 * The SiteMint Digital wordmark is the public site's refresh control (owner
 * directive, 2026-09-24): a plain left click always reloads the homepage
 * from the top, including mid-scroll and when already on the homepage, so
 * the hero restarts from its first frame. Modified clicks (new tab / window)
 * keep native link behaviour, and the href stays a real "/" for crawlers,
 * middle-click and the context menu.
 */
function restartHome(event: ReactMouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  restartAtTop(ROUTES.home);
}

export function MintChrome({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  // A wordmark restart from the previous document lands this load at the top.
  useEffect(() => {
    settleRestartAtTop();
  }, []);
  // A static local marketing preview does not host the authenticated apps.
  // Keep sign-in on its real HTTPS origin rather than a misleading local 404.
  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    const routeApp = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && /^\/(ai-receptionist\/dashboard|admin|portal)(\/|$)/.test(url.pathname)) {
        event.preventDefault();
        window.location.assign(`https://sitemintdigital.com${url.pathname}${url.search}${url.hash}`);
      }
    };
    document.addEventListener("click", routeApp, true);
    return () => document.removeEventListener("click", routeApp, true);
  }, []);
  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 24);
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(distance > 0 ? Math.min(1, window.scrollY / distance) : 0);
    };
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
        <span className="mint-reading-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
        <a className="logo" href={ROUTES.home} onClick={restartHome}>
          <span className="mark" aria-hidden="true">
            s
          </span>
          SiteMint <small>Digital</small>
        </a>
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
          <a className="logo" href={ROUTES.home} onClick={restartHome}>
            SiteMint <small>Digital</small>
          </a>
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
        <button className="mint-back-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>Back to top <span aria-hidden="true">↑</span></button>
      </footer>
    </div>
  );
}
