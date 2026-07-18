import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, Menu, Settings as SettingsIcon, CreditCard, Lock } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSession, useLogout } from "@/hooks/useSession";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { NAV_GROUPS, isNavItemActive, type NavItem } from "@/lib/nav";

const SIDEBAR_WIDTH_VARS = {
  "--sidebar-width": "248px",
  "--sidebar-width-icon": "72px",
} as CSSProperties;

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── Account menu (Settings / Billing / Sign out) ──────────────────────────

function AccountMenu({
  firmName,
  onLogout,
  compact = false,
}: {
  firmName: string;
  onLogout: () => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover-elevate active-elevate-2"
          aria-label={`Account menu for ${firmName}`}
        >
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-surface-muted text-primary text-xs font-semibold">
              {initials(firmName)}
            </AvatarFallback>
          </Avatar>
          {!compact && (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {firmName}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="truncate">{firmName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/billing" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="flex items-center gap-2">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Usage meter ────────────────────────────────────────────────────────────

function UsageMeter({
  usedCount,
  capCount,
  isPaid,
  collapsed,
}: {
  usedCount: number;
  capCount: number;
  isPaid: boolean;
  collapsed: boolean;
}) {
  if (isPaid) {
    return collapsed ? null : (
      <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-primary">
        Pro plan
      </div>
    );
  }

  const pct = capCount > 0 ? Math.min(100, Math.round((usedCount / capCount) * 100) || 0) : 0;

  if (collapsed) {
    return (
      <Link
        href="/billing"
        className="flex items-center justify-center rounded-lg border border-border py-1.5 text-[10px] font-semibold text-muted-foreground hover-elevate active-elevate-2"
        aria-label={`Trial usage: ${usedCount} of ${capCount} conversations used`}
        title={`${usedCount} of ${capCount} conversations used`}
      >
        {pct}%
      </Link>
    );
  }

  return (
    <Link
      href="/billing"
      className="block rounded-lg border border-border p-3 hover-elevate active-elevate-2"
      aria-label={`Trial usage: ${usedCount} of ${capCount} conversations used. Upgrade.`}
    >
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {usedCount} of {capCount} conversations
        </span>
        <span className="font-semibold text-primary">Upgrade →</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </Link>
  );
}

// ─── Nav item row ───────────────────────────────────────────────────────────

function NavRow({ item, location }: { item: NavItem; location: string }) {
  const active = isNavItemActive(item, location);
  const Icon = item.icon;

  if (item.state === "later") {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          disabled
          aria-disabled="true"
          aria-label={`${item.label} — Later`}
          tooltip={`${item.label} — Later`}
          className="cursor-not-allowed opacity-60"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge>Later</SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }

  if (!item.href) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild size="lg" isActive={active} tooltip={item.label}>
        <Link href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {item.state === "advanced" && (
        <SidebarMenuBadge>
          <Lock className="h-3 w-3" aria-hidden="true" />
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

// ─── Sidebar body (shared between desktop rail + mobile sheet) ────────────

function AppSidebar({
  location,
  firmName,
  usedCount,
  capCount,
  isPaid,
  onLogout,
}: {
  location: string;
  firmName: string;
  usedCount: number;
  capCount: number;
  isPaid: boolean;
  onLogout: () => void;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-2 py-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <Link href="/" className="min-w-0">
            <SiteMintLogo iconSize={28} showWordmark={!collapsed} />
          </Link>
          <SidebarTrigger className="hidden md:flex" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.voiceGated || voicePlatformEnabled);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.key}>
              <SidebarGroupLabel className="uppercase tracking-wider">
                {group.label}
              </SidebarGroupLabel>
              {collapsed && <SidebarSeparator className="mb-1" />}
              <SidebarMenu>
                {items.map((item) => (
                  <NavRow key={item.key} item={item} location={location} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-sidebar-border px-2 py-3">
        <UsageMeter usedCount={usedCount} capCount={capCount} isPaid={isPaid} collapsed={collapsed} />
        <ThemeToggle collapsed={collapsed} />
        <AccountMenu firmName={firmName} onLogout={onLogout} compact={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}

// ─── Mobile top bar ─────────────────────────────────────────────────────────

function MobileTopbar({ firmName, onLogout }: { firmName: string; onLogout: () => void }) {
  const { setOpenMobile } = useSidebar();

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-card px-3 md:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        onClick={() => setOpenMobile(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      <SiteMintLogo iconSize={24} showWordmark />
      <AccountMenu firmName={firmName} onLogout={onLogout} compact />
    </header>
  );
}

// ─── Root shell ─────────────────────────────────────────────────────────────

function CloseDrawerOnNavigate() {
  const [location] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: me, isLoading, isError } = useSession();
  const logout = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof document === "undefined") return true;
    const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
    if (match) return match[1] === "true";
    // No persisted preference yet: default to an icon rail below the
    // desktop breakpoint (tablet), expanded at/above it.
    return typeof window === "undefined" || window.innerWidth >= 1024;
  });

  useEffect(() => {
    if (!isLoading && isError) {
      navigate("/login");
    }
  }, [isLoading, isError, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <SiteMintLogo iconSize={36} showWordmark={false} />
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

  const isPaid = me.firm.planTier === "paid";
  const usedCount = me.conversationCount;
  const capCount = me.firm.trialConversationsLimit;

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      style={SIDEBAR_WIDTH_VARS}
      className="min-h-screen"
    >
      <CloseDrawerOnNavigate />
      <AppSidebar
        location={location}
        firmName={me.firm.name}
        usedCount={usedCount}
        capCount={capCount}
        isPaid={isPaid}
        onLogout={handleLogout}
      />
      <SidebarInset className="min-w-0">
        <MobileTopbar firmName={me.firm.name} onLogout={handleLogout} />
        <main role="main" className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
