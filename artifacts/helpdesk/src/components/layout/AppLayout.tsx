import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Users2,
  CreditCard,
  Bot,
  LogOut,
  Settings as SettingsIcon,
  Menu,
  X,
  Zap,
} from "lucide-react";
import { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSession, useLogout } from "@/hooks/useSession";

// ─── Nav structure ─────────────────────────────────────────────────────────

const NAV_GROUPS: {
  label: string | null;
  items: { href: string; label: string; icon: React.ElementType }[];
}[] = [
  {
    label: null,
    items: [{ href: "/", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "RECEPTIONIST",
    items: [
      { href: "/receptionist",  label: "AI Receptionist", icon: Bot },
      { href: "/conversations", label: "Conversations",   icon: MessageSquare },
      { href: "/contacts",      label: "Contacts",        icon: Users2 },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { href: "/billing",  label: "Billing",  icon: CreditCard },
      { href: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── Sidebar inner content ──────────────────────────────────────────────────

interface SidebarProps {
  location: string;
  me: { firm: { name: string; planTier: string; trialConversationsLimit: number }; conversationCount: number };
  onNavClick?: () => void;
  onLogout: () => void;
}

function SidebarInner({ location, me, onNavClick, onLogout }: SidebarProps) {
  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const isPaid    = me.firm.planTier === "paid";
  const usedCount = me.conversationCount;
  const capCount  = me.firm.trialConversationsLimit;
  const trialPct  = Math.min(100, capCount > 0 ? Math.round((usedCount / capCount) * 100) : 0);
  const isHigh    = trialPct >= 80;

  return (
    <>
      {/* Brand row */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100 flex-shrink-0">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
          S
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 leading-tight truncate">SiteMint</div>
          <div className="text-[10px] text-slate-500 leading-tight truncate">AI Receptionist</div>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-5" : ""}>
            {group.label && (
              <div className="px-2 mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {group.label}
                </span>
              </div>
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={onNavClick}>
                  <div
                    className={`relative flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-lg cursor-pointer transition-colors text-sm mb-0.5 ${
                      active
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {active && (
                      <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-indigo-600 rounded-r-sm" />
                    )}
                    <item.icon
                      className={`h-4 w-4 flex-shrink-0 ${
                        active ? "text-indigo-600" : "text-slate-400"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom section */}
      <div className="border-t border-slate-100 pb-3 pt-2 flex-shrink-0">
        {/* Trial chip / Pro badge */}
        {isPaid ? (
          <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-indigo-700">Pro plan</span>
          </div>
        ) : (
          <Link href="/billing">
            <div className="mx-2 mb-2 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-amber-50 hover:border-amber-200 transition-colors group">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] text-slate-600 group-hover:text-amber-800 leading-snug">
                  {usedCount} of {capCount} conversations
                </p>
                <span className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 ml-1 flex-shrink-0">
                  Upgrade →
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isHigh ? "bg-amber-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${trialPct}%` }}
                />
              </div>
            </div>
          </Link>
        )}

        {/* Avatar + sign out */}
        <div className="flex items-center gap-2.5 px-3">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold">
              {initials(me.firm.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-slate-700 font-medium truncate flex-1 min-w-0">
            {me.firm.name}
          </span>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0 p-0.5 rounded focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: me, isLoading, isError } = useSession();
  const logout = useLogout();

  useEffect(() => {
    if (!isLoading && isError) {
      navigate("/login");
    }
  }, [isLoading, isError, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg animate-pulse shadow-sm" />
      </div>
    );
  }

  if (isError || !me) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans">
      {/* ── Desktop sidebar ── */}
      <div role="navigation" aria-label="Main navigation" className="hidden md:flex w-[232px] flex-shrink-0 border-r border-slate-200 bg-white flex-col z-20 shadow-sm">
        <SidebarInner location={location} me={me} onLogout={handleLogout} />
      </div>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-white border-b border-slate-200 flex items-center px-4 z-30 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors mr-3"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center text-white font-bold text-xs">
            S
          </div>
          <span className="text-sm font-semibold text-slate-900">SiteMint</span>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div role="navigation" aria-label="Main navigation" className="relative flex flex-col w-[232px] h-full bg-white border-r border-slate-200 shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarInner
              location={location}
              me={me}
              onNavClick={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main role="main" className="flex-1 overflow-hidden flex flex-col min-w-0 md:mt-0 mt-12">
        {children}
      </main>
    </div>
  );
}
