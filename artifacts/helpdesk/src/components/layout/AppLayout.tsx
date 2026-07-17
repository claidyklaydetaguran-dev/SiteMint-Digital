import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  Users2,
  CreditCard,
  Bot,
  LogOut,
  Settings as SettingsIcon,
} from "lucide-react";
import { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSession, useLogout } from "@/hooks/useSession";

// ─── Nav structure ────────────────────────────────────────────────────────────

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
      { href: "/conversations", label: "Conversations",    icon: MessageSquare },
      { href: "/contacts",      label: "Contacts",         icon: Users2 },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: me, isLoading, isError } = useSession();
  const logout = useLogout();

  useEffect(() => {
    if (!isLoading && isError) {
      navigate("/login");
    }
  }, [isLoading, isError, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (isError || !me) {
    return null;
  }

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isPaid     = me.firm.planTier === "paid";
  const usedCount  = me.conversationCount;
  const capCount   = me.firm.trialConversationsLimit;
  const trialPct   = Math.min(100, capCount > 0 ? Math.round((usedCount / capCount) * 100) : 0);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans">
      {/* Sidebar */}
      <div className="w-[210px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col z-20">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            S
          </div>
          <span className="text-sm font-semibold text-slate-900 truncate">SiteMint</span>
        </div>

        {/* Nav groups */}
        <div className="flex-1 overflow-y-auto py-3 px-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-4" : ""}>
              {group.label && (
                <div className="px-2 mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {group.label}
                  </span>
                </div>
              )}
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                        active
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
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

        {/* Bottom — trial chip + avatar */}
        <div className="border-t border-slate-100 pb-3 pt-2">
          {/* Trial chip (hidden when paid) */}
          {!isPaid && (
            <Link href="/billing">
              <div className="mx-2 mb-2 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <p className="text-[11px] text-slate-600 leading-snug mb-1.5">
                  {usedCount} of {capCount} free conversations used
                </p>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
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
              onClick={handleLogout}
              className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">{children}</main>
    </div>
  );
}
