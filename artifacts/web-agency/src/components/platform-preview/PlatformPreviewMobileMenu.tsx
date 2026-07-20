import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, X } from "lucide-react";
import {
  clientLoginHref,
  companyNavItems,
  productsNavItems,
  servicesNavItems,
  startProjectHref,
  type PreviewNavChild,
} from "./navConfig";

function MobileSection({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: PreviewNavChild[];
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[hsl(var(--sm-color-border-default))] py-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-[var(--sm-radius-md)] px-2 py-3 text-left text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]"
      >
        {label}
        <ChevronDown size={18} aria-hidden="true" className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {expanded && (
        <ul className="flex flex-col gap-1 pb-2 pl-2">
          {items.map((child) =>
            child.disabled ? (
              <li key={child.label} aria-disabled="true" className="px-2 py-2 text-sm text-[hsl(var(--sm-color-text-muted))]">
                {child.label} <span className="text-xs">({child.disabledNote})</span>
              </li>
            ) : (
              <li key={child.label}>
                <Link
                  href={child.href!}
                  onClick={onNavigate}
                  className="block rounded-[var(--sm-radius-md)] px-2 py-2 text-sm text-[hsl(var(--sm-color-text-secondary))] hover:bg-[hsl(var(--sm-color-surface-interactive))]"
                >
                  {child.label}
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

export function PlatformPreviewMobileMenu({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
      ref={panelRef}
      className="fixed inset-0 z-[var(--sm-z-modal)] flex flex-col overflow-y-auto bg-[hsl(var(--sm-color-bg-elevated))] lg:hidden"
    >
      <div className="flex items-center justify-between px-5 py-4">
        <span className="pp-font-display text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]">Menu</span>
        <button
          type="button"
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--sm-radius-md)] border border-[hsl(var(--sm-color-border-default))] text-[hsl(var(--sm-color-text-primary))]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <nav className="flex-1 px-5">
        <MobileSection label="Products" items={productsNavItems} onNavigate={onClose} />
        <MobileSection label="Services" items={servicesNavItems} onNavigate={onClose} />
        <div className="border-b border-[hsl(var(--sm-color-border-default))] py-2">
          <Link
            href="/portfolio"
            onClick={onClose}
            className="block rounded-[var(--sm-radius-md)] px-2 py-3 text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]"
          >
            Work
          </Link>
        </div>
        <div className="border-b border-[hsl(var(--sm-color-border-default))] py-2">
          <Link
            href="/pricing"
            onClick={onClose}
            className="block rounded-[var(--sm-radius-md)] px-2 py-3 text-lg font-semibold text-[hsl(var(--sm-color-text-primary))]"
          >
            Pricing
          </Link>
        </div>
        <MobileSection label="Company" items={companyNavItems} onNavigate={onClose} />
      </nav>

      <div className="flex flex-col gap-3 px-5 py-6">
        <Link
          href={clientLoginHref}
          onClick={onClose}
          className="rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-strong))] px-4 py-3 text-center text-sm font-medium text-[hsl(var(--sm-color-text-primary))]"
        >
          Client Login
        </Link>
        <Link
          href={startProjectHref}
          onClick={onClose}
          className="rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] px-4 py-3 text-center text-sm font-semibold text-[var(--sm-button-primary-text)]"
        >
          Start a Project
        </Link>
      </div>
    </div>
  );
}
