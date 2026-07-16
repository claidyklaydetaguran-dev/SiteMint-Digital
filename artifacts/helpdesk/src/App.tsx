import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";

import Login from "@/pages/Login";
import Inbox from "@/pages/Inbox";
import Contacts from "@/pages/Contacts";
import ContactDetail from "@/pages/ContactDetail";
import Settings from "@/pages/Settings";
import Deploy from "@/pages/Deploy";
import Billing from "@/pages/Billing";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Inbox} />
            <Route path="/contacts" component={Contacts} />
            <Route path="/contacts/:id" component={ContactDetail} />
            <Route path="/deploy" component={Deploy} />
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
