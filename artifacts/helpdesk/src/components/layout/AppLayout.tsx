import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarFooter } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Inbox, Users, PlusCircle, UserCog, Settings, CreditCard } from "lucide-react";
import { ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Inbox", icon: Inbox },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/tickets/new", label: "New Ticket", icon: PlusCircle },
    { href: "/agents", label: "Agents", icon: UserCog },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar variant="sidebar" collapsible="icon">
          <SidebarHeader className="h-14 flex items-center justify-center border-b border-border">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold text-xl cursor-pointer">
              S
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
                    tooltip={item.label}
                  >
                    <Link href={item.href} className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/billing")} tooltip="Billing">
                  <Link href="/billing" className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
                    <CreditCard className="h-4 w-4" />
                    <span>Billing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
      </div>
    </SidebarProvider>
  );
}
