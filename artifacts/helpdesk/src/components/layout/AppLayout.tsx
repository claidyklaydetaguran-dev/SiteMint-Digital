import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  MessageSquare,
  Users2,
  Globe2,
  CreditCard,
  Phone,
  Settings,
  Bot,
} from "lucide-react";
import { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CallDialer } from "./CallDialer";

const TOP_NAV = [
  { href: "/", label: "Inbox", icon: MessageSquare },
  { href: "/contacts", label: "Contacts", icon: Users2 },
  { href: "/deploy", label: "Deploy", icon: Globe2 },
  { href: "/settings", label: "Settings", icon: Bot },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [dialerOpen, setDialerOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

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
          {/* Phone / Call */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  dialerOpen ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                }`}
                onClick={() => setDialerOpen((o) => !o)}
              >
                <Phone className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Call</TooltipContent>
          </Tooltip>

          {/* Billing */}
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Link href="/billing">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                    isActive("/billing") ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                </div>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Billing</TooltipContent>
          </Tooltip>

          {/* Avatar */}
          <div className="mt-2 cursor-pointer">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-semibold">
                SA
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">{children}</main>

      {/* Floating call dialer */}
      {dialerOpen && <CallDialer onClose={() => setDialerOpen(false)} />}
    </div>
  );
}
