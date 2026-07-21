import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";

export function Footer() {
  return (
    <footer className="bg-foreground text-background pt-20 pb-10">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div className="lg:col-span-1">
            <Link href="/" className="inline-flex mb-6">
              <SiteMintLogo variant="light" iconSize={34} />
            </Link>
            <p className="text-muted/80 text-sm leading-relaxed mb-6 max-w-sm">
              We build digital systems that help businesses attract leads, build trust, and operate smarter.
            </p>
          </div>

          <div>
            <h4 className="font-serif font-semibold text-lg mb-6">Navigation</h4>
            <ul className="flex flex-col gap-4">
              {[
                { name: "Home", href: "/" },
                { name: "Services", href: "/services" },
                { name: "Pricing", href: "/pricing" },
                { name: "Portfolio", href: "/portfolio" },
                { name: "About", href: "/about" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-muted/80 hover:text-primary transition-colors text-sm flex items-center gap-1 group">
                    {link.name} <ArrowUpRight size={12} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-serif font-semibold text-lg mb-6">Services</h4>
            <ul className="flex flex-col gap-4">
              {["Website Design", "Web Applications", "CRM Systems", "SEO Foundation", "Ongoing Care", "Business Automation"].map((s) => (
                <li key={s} className="text-muted/80 text-sm">{s}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-serif font-semibold text-lg mb-6">Contact</h4>
            <ul className="flex flex-col gap-4">
              <li><a href="mailto:info.sitemint@gmail.com" className="text-muted/80 text-sm hover:text-primary transition-colors">info.sitemint@gmail.com</a></li>
              <li><a href="tel:9498806515" className="text-muted/80 text-sm hover:text-primary transition-colors">949-880-6515</a></li>
              <li className="mt-4">
                <Link href="/discovery" className="inline-block text-background border-b border-primary/50 hover:border-primary transition-colors pb-1 text-sm font-medium">
                  Start a project →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted/60">
          <p>© {new Date().getFullYear()} SiteMint Digital Solutions. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="cursor-pointer hover:text-primary transition-colors">Privacy Policy</span>
            <span className="cursor-pointer hover:text-primary transition-colors">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
