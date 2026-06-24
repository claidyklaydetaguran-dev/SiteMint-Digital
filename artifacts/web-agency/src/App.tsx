import { Layout } from "@/components/layout/Layout";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Services from "@/pages/Services";
import Pricing from "@/pages/Pricing";
import Portfolio from "@/pages/Portfolio";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Discovery from "@/pages/Discovery";
import ThankYou from "@/pages/ThankYou";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminSubmissionDetail from "@/pages/AdminSubmissionDetail";
import CrmDashboard from "@/pages/crm/CrmDashboard";
import CrmLeads from "@/pages/crm/CrmLeads";
import CrmLeadDetail from "@/pages/crm/CrmLeadDetail";
import CrmPipeline from "@/pages/crm/CrmPipeline";
import CrmTasks from "@/pages/crm/CrmTasks";
import CrmEmailTemplates from "@/pages/crm/CrmEmailTemplates";
import CrmImport from "@/pages/crm/CrmImport";
import CrmSettings from "@/pages/crm/CrmSettings";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Admin routes — no main layout */}
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/submissions/:id" component={AdminSubmissionDetail} />

      {/* CRM routes — no main layout */}
      <Route path="/admin/crm" component={CrmDashboard} />
      <Route path="/admin/crm/leads" component={CrmLeads} />
      <Route path="/admin/crm/leads/:id" component={CrmLeadDetail} />
      <Route path="/admin/crm/pipeline" component={CrmPipeline} />
      <Route path="/admin/crm/tasks" component={CrmTasks} />
      <Route path="/admin/crm/email-templates" component={CrmEmailTemplates} />
      <Route path="/admin/crm/import" component={CrmImport} />
      <Route path="/admin/crm/settings" component={CrmSettings} />

      {/* Discovery form — no main layout */}
      <Route path="/discovery" component={Discovery} />

      {/* Thank You — no main layout */}
      <Route path="/thank-you" component={ThankYou} />

      {/* Public site — with main layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/services" component={Services} />
            <Route path="/pricing" component={Pricing} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/about" component={About} />
            <Route path="/contact" component={Contact} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
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
