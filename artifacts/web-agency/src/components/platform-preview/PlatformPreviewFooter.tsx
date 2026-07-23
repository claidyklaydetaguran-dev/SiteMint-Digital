import { Link } from "wouter";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { signInHref, workHref, pricingHref } from "./navConfig";

const footerGroups = [
  {
    heading: "Products",
    links: [
      { label: "AI Receptionist", href: "/ai-receptionist" },
    ],
  },
  {
    heading: "Services",
    links: [
      { label: "All Services", href: "/services" },
      { label: "Pricing", href: pricingHref },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Work", href: workHref },
      { label: "Contact", href: "/contact" },
    ],
  },
];

/**
 * `variant` defaults to "light" — today's exact rendering (same
 * sm-color-* tokens, same classes), so the homepage's call site
 * (PlatformPreview.tsx) needs no change and stays visually byte-identical.
 * The five redesigned inner pages opt into `variant="dark"`, which swaps
 * only background/text/border tokens onto the same pp-navy and
 * pp-text-on-dark tokens the rest of the dark inner-page system uses —
 * every link href, label, group, and landmark stays identical between the
 * two variants; nothing is duplicated.
 */
export function PlatformPreviewFooter({ variant = "light" }: { variant?: "light" | "dark" }) {
  const isDark = variant === "dark";

  const footerClassName = isDark
    ? "border-t py-16"
    : "border-t border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-bg-subtle))] py-16";
  const footerStyle = isDark
    ? { backgroundColor: "hsl(var(--pp-navy-950))", borderColor: "hsl(var(--pp-cyan-mint) / 0.14)" }
    : undefined;

  const headingClassName = isDark
    ? "pp-font-display mt-1 max-w-xs text-lg font-semibold leading-snug"
    : "pp-font-display mt-1 max-w-xs text-lg font-semibold leading-snug text-[hsl(var(--sm-color-text-primary))]";
  const headingStyle = isDark ? { color: "hsl(var(--pp-text-on-dark))" } : undefined;

  const bodyClassName = isDark
    ? "mt-3 max-w-xs text-sm leading-relaxed"
    : "mt-3 max-w-xs text-sm leading-relaxed text-[hsl(var(--sm-color-text-muted))]";
  const bodyStyle = isDark ? { color: "hsl(var(--pp-text-on-dark-muted))" } : undefined;

  const groupHeadingClassName = isDark
    ? "pp-font-display mb-4 text-sm font-semibold uppercase tracking-wide"
    : "pp-font-display mb-4 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--sm-color-text-primary))]";
  const groupHeadingStyle = isDark ? { color: "hsl(var(--pp-text-on-dark))" } : undefined;

  const linkClassName = isDark
    ? "text-sm transition-colors"
    : "text-sm text-[hsl(var(--sm-color-text-muted))] transition-colors hover:text-[hsl(var(--sm-color-action-primary))]";
  const linkStyle = isDark ? { color: "hsl(var(--pp-text-on-dark-muted))" } : undefined;
  const linkHoverClassName = isDark ? "hover:text-[hsl(var(--pp-cyan-mint))]" : "";

  const bottomBarClassName = isDark
    ? "mx-auto mt-12 max-w-[1280px] border-t px-4 pt-6 text-xs md:px-8"
    : "mx-auto mt-12 max-w-[1280px] border-t border-[hsl(var(--sm-color-border-default))] px-4 pt-6 text-xs text-[hsl(var(--sm-color-text-muted))] md:px-8";
  const bottomBarStyle = isDark
    ? { borderColor: "hsl(var(--pp-cyan-mint) / 0.14)", color: "hsl(var(--pp-text-on-dark-faint))" }
    : undefined;

  return (
    <footer className={footerClassName} style={footerStyle}>
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-4 md:grid-cols-2 md:px-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Link href="/" className="inline-flex mb-4">
            <SiteMintLogo variant="dark" iconSize={30} />
          </Link>
          <p className={headingClassName} style={headingStyle}>
            Websites, AI products, and the systems that connect them.
          </p>
          <p className={bodyClassName} style={bodyStyle}>
            One SiteMint Digital account team, one connected technology company — not a website
            vendor and a software vendor working apart.
          </p>
        </div>

        {footerGroups.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className={groupHeadingClassName} style={groupHeadingStyle}>
              {group.heading}
            </h2>
            <ul className="flex flex-col gap-3">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className={`${linkClassName} ${linkHoverClassName}`} style={linkStyle}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <nav aria-label="Account">
          <h2 className={groupHeadingClassName} style={groupHeadingStyle}>
            Account
          </h2>
          <ul className="flex flex-col gap-3">
            <li>
              <Link
                href={signInHref}
                aria-label="Sign in to AI Receptionist"
                className={`${linkClassName} ${linkHoverClassName}`}
                style={linkStyle}
              >
                Sign In
              </Link>
            </li>
            <li>
              <a href="mailto:info.sitemint@gmail.com" className={`${linkClassName} ${linkHoverClassName}`} style={linkStyle}>
                info.sitemint@gmail.com
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className={bottomBarClassName} style={bottomBarStyle}>
        <p>© {new Date().getFullYear()} SiteMint Digital Solutions. All rights reserved. This is an internal, unpublished preview — not the live SiteMint site.</p>
      </div>
    </footer>
  );
}
