import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  MessageSquare,
  Users2,
  Globe2,
  CreditCard,
  Phone,
  Bot,
  LogOut,
} from "lucide-react";
import { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession, useLogout } from "@/hooks/useSession";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const TOP_NAV = [
  { href: "/", label: "Inbox", icon: MessageSquare },
  { href: "/contacts", label: "Contacts", icon: Users2 },
  { href: "/deploy", label: "Deploy", icon: Globe2 },
  { href: "/settings", label: "Settings", icon: Bot },
];

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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans">
      {/* Icon-only nav rail */}
      <div className="w-[56px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col items-center py-3 z-20">
        {/* Logo */}
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-base mb-4 cursor-pointer select-none">
          S
        </div>

        {/* Top nav items */}
        <div className="flex flex-col gap-1 flex-1 w-full px-2 mt-1">
          {TOP_NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Tooltip key={item.href} delayDuration={300}>
                <TooltipTrigger asChild>
                  <Link href={item.href}>
                    <div
                      className={`relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                        active
                          ? "bg-indigo-50 text-indigo-600"
                          : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-indigo-600 rounded-r-full -ml-2" />
                      )}
                      <item.icon className="h-5 w-5" />
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Bottom nav */}
        <div className="flex flex-col gap-1 w-full px-2 items-center">
          {/* Phone — coming soon */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-300 cursor-not-allowed">
                <Phone className="h-5 w-5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Call Dialer — coming soon
            </TooltipContent>
          </Tooltip>

          {/* Billing */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Link href="/billing">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                    isActive("/billing")
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                </div>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Billing
            </TooltipContent>
          </Tooltip>

          {/* Avatar — click to sign out */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button className="mt-2 cursor-pointer" onClick={handleLogout}>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold">
                    {initials(me.firm.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs flex items-center gap-1">
              <LogOut className="h-3 w-3" /> Sign out
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">{children}</main>
    </div>
  );
}
