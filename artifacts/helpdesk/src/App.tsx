import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";

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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <AppLayout>
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
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
