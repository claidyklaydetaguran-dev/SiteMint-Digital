import { Link, useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import {
  Search, Mail, Phone, MessageSquare, Bell, LogOut,
  ChevronDown, LayoutDashboard,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin/crm", label: "Dashboard", exact: true },
  { href: "/admin/crm/leads", label: "People" },
  { href: "/admin/crm/inbox", label: "Inbox" },
  { href: "/admin/crm/tasks", label: "Tasks" },
  { href: "/admin/crm/calendar", label: "Calendar" },
  { href: "/admin/crm/deals", label: "Deals" },
  { href: "/admin/crm/reporting", label: "Reporting" },
  { href: "/admin/crm/admin", label: "Admin" },
];

export function CrmLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const logout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin");
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact || href === "/admin/crm") return location === href;
    return location.startsWith(href);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f1f3f5" }}>
      {/* Dark top nav */}
      <nav className="bg-[#1e293b] h-12 flex items-center px-3 shrink-0 z-50 relative gap-1">
        {/* Logo */}
        <div className="flex items-center shrink-0 mr-3">
          <SiteMintLogo variant="light" iconSize={20} />
        </div>

        {/* Nav items */}
        <div className="flex items-center h-full overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map(({ href, label, exact }) => (
            <Link key={href} href={href}>
              <button
                className={`h-12 px-3 text-[13px] font-medium whitespace-nowrap transition-colors relative shrink-0 ${
                  isActive(href, exact)
                    ? "text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-blue-400 after:rounded-full"
                    : "text-white/55 hover:text-white/90"
                }`}
              >
                {label}
              </button>
            </Link>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xs mx-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search people, deals…"
              className="w-full bg-white/10 text-white text-xs placeholder-white/35 pl-8 pr-3 py-1.5 rounded-md border border-white/10 focus:outline-none focus:border-white/30 focus:bg-white/15"
            />
          </div>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <a href="mailto:" title="Send email"
             className="w-7 h-7 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors">
            <Mail className="w-3.5 h-3.5 text-white" />
          </a>
          <a href="tel:" title="Call"
             className="w-7 h-7 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors">
            <Phone className="w-3.5 h-3.5 text-white" />
          </a>
          <button title="SMS — Connect provider in Admin > Integrations"
             className="w-7 h-7 bg-sky-600 hover:bg-sky-700 rounded-full flex items-center justify-center transition-colors">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </button>
          <button title="Notifications"
             className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
            <Bell className="w-3.5 h-3.5 text-white/70" />
          </button>

          {/* Avatar dropdown */}
          <div className="relative ml-1" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(o => !o)}
              className="flex items-center gap-1 focus:outline-none"
            >
              <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center">
                <span className="text-white text-[11px] font-bold">SM</span>
              </div>
              <ChevronDown className={`w-3 h-3 text-white/50 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden py-1">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-xs font-semibold text-foreground">SiteMint Digital</p>
                  <p className="text-xs text-muted-foreground">Admin</p>
                </div>
                <Link href="/admin/dashboard">
                  <button className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" /> Submissions
                  </button>
                </Link>
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
