import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ComingSoon } from "@/components/common/ComingSoon";
import { NAV_GROUPS } from "@/lib/nav";
import { voicePlatformEnabled } from "@/lib/featureFlags";

import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Inbox from "@/pages/Inbox";
import AgentConfig from "@/pages/AgentConfig";
import Contacts from "@/pages/Contacts";
import ContactDetail from "@/pages/ContactDetail";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";

const queryClient = new QueryClient();

function InSpaRedirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

// Voice-platform destinations only get a route when the flag is on; when
// off, direct navigation falls through to NotFound instead of exposing a
// half-built surface.
const comingSoonRoutes = voicePlatformEnabled
  ? NAV_GROUPS.flatMap((group) => group.items).filter(
      (item) => item.href && (item.state === "comingSoon" || item.state === "advanced"),
    )
  : [];

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <AppShell>
          <Switch>
            <Route path="/" component={Overview} />
            <Route path="/conversations" component={Inbox} />
            <Route path="/receptionist" component={AgentConfig} />
            <Route path="/contacts" component={Contacts} />
            <Route path="/contacts/:id" component={ContactDetail} />
            <Route path="/deploy">
              {() => <InSpaRedirect to="/receptionist" />}
            </Route>
            <Route path="/settings" component={Settings} />
            <Route path="/billing" component={Billing} />
            {comingSoonRoutes.map((item) => (
              <Route key={item.key} path={item.href!}>
                <ComingSoon
                  title={item.label}
                  description={item.description}
                  icon={item.icon}
                  availability={item.availability}
                />
              </Route>
            ))}
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
