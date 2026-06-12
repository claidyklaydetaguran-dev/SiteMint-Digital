import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-foreground text-background pt-20 pb-10">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-6 group inline-flex">
              <div className="w-8 h-8 bg-background text-foreground rounded-sm flex items-center justify-center font-serif font-bold text-xl">
                S
              </div>
              <span className="font-serif font-semibold text-xl tracking-tight text-background">
                Systemic
              </span>
            </Link>
            <p className="text-muted/80 text-sm leading-relaxed mb-6 max-w-sm">
              We build digital systems that help businesses attract leads, build trust, and operate smarter.
            </p>
            <div className="flex gap-4">
              {/* Social placeholders */}
              <div className="w-10 h-10 rounded-full border border-muted/20 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
                In
              </div>
              <div className="w-10 h-10 rounded-full border border-muted/20 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
                X
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-serif font-semibold text-lg mb-6">Navigation</h4>
            <ul className="flex flex-col gap-4">
              <li>
                <Link href="/" className="text-muted/80 hover:text-background transition-colors text-sm flex items-center gap-1">
                  Home <ArrowUpRight size={12} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </Link>
              </li>
              <li>
                <Link href="/services" className="text-muted/80 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                  Services <ArrowUpRight size={12} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-muted/80 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                  Pricing <ArrowUpRight size={12} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="text-muted/80 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                  Portfolio <ArrowUpRight size={12} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-muted/80 hover:text-background transition-colors text-sm flex items-center gap-1 group">
                  About <ArrowUpRight size={12} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif font-semibold text-lg mb-6">Services</h4>
            <ul className="flex flex-col gap-4">
              <li className="text-muted/80 text-sm">Website Design</li>
              <li className="text-muted/80 text-sm">Web Applications</li>
              <li className="text-muted/80 text-sm">SEO Foundation</li>
              <li className="text-muted/80 text-sm">Blog Support</li>
              <li className="text-muted/80 text-sm">Ongoing Care</li>
              <li className="text-muted/80 text-sm">Business Automation</li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif font-semibold text-lg mb-6">Contact</h4>
            <ul className="flex flex-col gap-4">
              <li className="text-muted/80 text-sm">hello@systemic.agency</li>
              <li className="text-muted/80 text-sm">+1 (555) 123-4567</li>
              <li className="text-muted/80 text-sm">San Francisco, CA</li>
              <li className="mt-4">
                <Link href="/contact" className="inline-block text-background border-b border-background/30 hover:border-background transition-colors pb-1 text-sm font-medium">
                  Start a project
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted/60">
          <p>© {new Date().getFullYear()} Systemic Agency. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="cursor-pointer hover:text-background transition-colors">Privacy Policy</span>
            <span className="cursor-pointer hover:text-background transition-colors">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
