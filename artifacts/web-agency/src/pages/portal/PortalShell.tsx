// ── M4: the customer portal's chrome ────────────────────────────────────────
//
// The public site's conventions, not the CRM's. No "AUTHORIZED PERSONNEL", no
// sidebar of internal tools, no staff vocabulary — a client signing in to look
// at their own project should recognise the company they hired, not be shown
// the back office.
//
// Built for 375px first: one column, a horizontally scrolling tab strip rather
// than a menu that has to be opened, and every control at least 44px tall so it
// can be hit with a thumb.

import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw, LogOut } from "lucide-react";
import {
  portalFetch, clearPortalCsrf, PortalError, type PortalLoadState,
} from "./portalApi";

const TABS = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/projects", label: "Projects" },
  { href: "/portal/documents", label: "Documents" },
  // M5. Both labels changed when the pages stopped being what they were called:
  // /portal/proposals now carries itemised quotes as well as headline
  // proposals, and /portal/invoices carries actual invoices rather than only
  // the payments received against nothing in particular.
  { href: "/portal/proposals", label: "Quotes" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/support", label: "Support" },
];

interface Contact { name: string; company: string | null; email: string }

/**
 * Loads something once, and gives the caller the three states that actually
 * exist: loading, a real error the reader can act on, and data. There is no
 * fourth "empty object" state pretending to be success.
 */
export function usePortalResource<T>(path: string, deps: unknown[] = []): {
  state: PortalLoadState<T>;
  reload: () => void;
} {
  const [state, setState] = useState<PortalLoadState<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    portalFetch<T>(path)
      .then((data) => { if (!cancelled) setState({ status: "ready", data }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof PortalError ? err : new PortalError("Something went wrong at our end.", 0),
        });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { state, reload: () => setNonce((n) => n + 1) };
}

/** A real error state: what happened, and the one button that might fix it. */
export function PortalErrorState({ error, onRetry }: { error: PortalError; onRetry: () => void }) {
  const [, navigate] = useLocation();
  if (error.needsSignIn) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Your session has ended.</p>
        <Button className="mt-4 min-h-11 w-full sm:w-auto" onClick={() => navigate("/portal/sign-in")}>
          Sign in again
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-foreground">We could not load this.</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
      <Button variant="outline" className="mt-4 min-h-11 w-full sm:w-auto" onClick={onRetry}>
        <RotateCw className="mr-2 h-4 w-4" aria-hidden /> Try again
      </Button>
    </div>
  );
}

export function PortalLoadingState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function PortalEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

/** One consistent card, so every page reads the same at 375px. */
export function PortalCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</div>
  );
}

export default function PortalShell({ title, children }: { title: string; children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { state } = usePortalResource<{ contact: Contact }>("/api/portal/me");

  async function signOut() {
    try { await portalFetch("/api/portal/logout", { method: "POST", body: {} }); }
    catch { /* the cookie is cleared server-side or the session is already gone */ }
    clearPortalCsrf();
    navigate("/portal/sign-in");
  }

  const contact = state.status === "ready" ? state.data.contact : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="flex min-h-11 items-center gap-2">
            <SiteMintLogo className="h-7 w-auto" />
            <span className="sr-only">SiteMint client area</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {contact && (
              <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">
                {contact.company ?? contact.name}
              </span>
            )}
            <Button
              variant="ghost"
              className="min-h-11 min-w-11 px-3"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="ml-2 hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>

        {/* A scrolling strip rather than a hamburger: six destinations is not
            enough to justify hiding them behind a tap. `-webkit-overflow-
            scrolling` is the browser's own momentum, and the container is the
            only thing that scrolls sideways — the page body never does. */}
        <nav className="mx-auto max-w-5xl overflow-x-auto px-2 pb-1" aria-label="Your account">
          <ul className="flex w-max gap-1">
            {TABS.map((tab) => {
              const active = location === tab.href
                || (tab.href !== "/portal" && location.startsWith(tab.href));
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <div className="mt-4 space-y-4">{children}</div>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4">
        <p className="text-xs text-muted-foreground">
          Questions about anything here? Raise them under Support and they reach the
          person working on your account.
        </p>
      </footer>
    </div>
  );
}
