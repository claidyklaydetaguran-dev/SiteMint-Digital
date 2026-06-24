import { Link, useLocation } from "wouter";
import { useState } from "react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import {
  LayoutDashboard, Users, Kanban, CheckSquare, Mail, Upload,
  Settings, LogOut, Menu, X, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin/crm", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/crm/leads", label: "Leads", icon: Users },
  { href: "/admin/crm/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/admin/crm/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/admin/crm/email-templates", label: "Email Templates", icon: Mail },
  { href: "/admin/crm/import", label: "Import Leads", icon: Upload },
  { href: "/admin/crm/settings", label: "Settings", icon: Settings },
];

export function CrmLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin");
  };

  const isActive = (href: string) => {
    if (href === "/admin/crm") return location === "/admin/crm";
    return location.startsWith(href);
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <SiteMintLogo variant="light" iconSize={24} />
        <p className="text-xs text-white/40 mt-1 ml-1">CRM</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <button
              onClick={() => setSidebarOpen(false)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive(href)
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/8 hover:text-white/90"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {isActive(href) && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
            </button>
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        <Link href="/admin/dashboard">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/8 transition-all">
            <LayoutDashboard className="w-4 h-4" />
            Back to Submissions
          </button>
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-red-400 hover:bg-white/8 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-foreground shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col w-56 bg-foreground z-50">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-foreground text-white border-b border-white/10">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <SiteMintLogo variant="light" iconSize={24} />
          <span className="text-xs text-white/40 ml-1">CRM</span>
        </div>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
