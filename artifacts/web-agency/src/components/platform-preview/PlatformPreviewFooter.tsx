import { Link } from "wouter";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { signInHref } from "./navConfig";

const footerGroups = [
  {
    heading: "Products",
    links: [
      { label: "AI Receptionist", href: "/ai-receptionist" },
    ],
  },
  {
    heading: "Services",
    links: [{ label: "All Services", href: "/services" }],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Work", href: "/portfolio" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export function PlatformPreviewFooter() {
  return (
    <footer className="border-t border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-bg-subtle))] py-16">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-4 md:grid-cols-2 md:px-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Link href="/" className="inline-flex mb-4">
            <SiteMintLogo variant="dark" iconSize={30} />
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-[hsl(var(--sm-color-text-muted))]">
            One connected technology company: websites, AI products, and the systems that run them.
          </p>
        </div>

        {footerGroups.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="pp-font-display mb-4 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-primary))]">
              {group.heading}
            </h2>
            <ul className="flex flex-col gap-3">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[hsl(var(--sm-color-text-muted))] transition-colors hover:text-[hsl(var(--sm-color-action-primary))]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <nav aria-label="Account">
          <h2 className="pp-font-display mb-4 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-primary))]">
            Account
          </h2>
          <ul className="flex flex-col gap-3">
            <li>
              <Link
                href={signInHref}
                aria-label="Sign in to AI Receptionist"
                className="text-sm text-[hsl(var(--sm-color-text-muted))] transition-colors hover:text-[hsl(var(--sm-color-action-primary))]"
              >
                Sign In
              </Link>
            </li>
            <li>
              <a
                href="mailto:info.sitemint@gmail.com"
                className="text-sm text-[hsl(var(--sm-color-text-muted))] transition-colors hover:text-[hsl(var(--sm-color-action-primary))]"
              >
                info.sitemint@gmail.com
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-12 max-w-[1280px] border-t border-[hsl(var(--sm-color-border-default))] px-4 pt-6 text-xs text-[hsl(var(--sm-color-text-muted))] md:px-8">
        <p>© {new Date().getFullYear()} SiteMint Digital Solutions. All rights reserved. This is an internal, unpublished preview — not the live SiteMint site.</p>
      </div>
    </footer>
  );
}
