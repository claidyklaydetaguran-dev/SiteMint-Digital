import { Layout } from "@/components/layout/Layout";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
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
import CrmExecutiveDashboard from "@/pages/crm/CrmExecutiveDashboard";
import CrmLeads from "@/pages/crm/CrmLeads";
import CrmLeadDetail from "@/pages/crm/CrmLeadDetail";
import CrmPipeline from "@/pages/crm/CrmPipeline";
import CrmTasks from "@/pages/crm/CrmTasks";
import CrmEmailTemplates from "@/pages/crm/CrmEmailTemplates";
import CrmImport from "@/pages/crm/CrmImport";
import CrmSettings from "@/pages/crm/CrmSettings";
import CrmInbox from "@/pages/crm/CrmInbox";
import CrmCalendar from "@/pages/crm/CrmCalendar";
import CrmDeals from "@/pages/crm/CrmDeals";
import CrmProjects from "@/pages/crm/CrmProjects";
import CrmReporting from "@/pages/crm/CrmReporting";
import CrmAdminSettings from "@/pages/crm/CrmAdminSettings";
import CrmCampaigns from "@/pages/crm/CrmCampaigns";
import CrmCampaignBuilderPage from "@/pages/crm/CrmCampaignBuilderPage";
import CrmCampaignQueuePage from "@/pages/crm/CrmCampaignQueuePage";
import CrmWorkspaceLanding from "@/pages/crm/CrmWorkspaceLanding";
import CrmDiscovery from "@/pages/crm/CrmDiscovery";
import CrmCommunications from "@/pages/crm/CrmCommunications";
import CrmBehavioralIntelligence from "@/pages/crm/CrmBehavioralIntelligence";
import CrmAutomationQueue from "@/pages/crm/CrmAutomationQueue";
import CrmLeadDna from "@/pages/crm/CrmLeadDna";
import { CrmErrorBoundary } from "@/components/CrmErrorBoundary";

const queryClient = new QueryClient();

function CrmHomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/admin/crm/dashboard"); }, [navigate]);
  return null;
}

function Router() {
  return (
    <Switch>
      {/* Admin routes — no main layout */}
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/submissions/:id" component={AdminSubmissionDetail} />

      {/* CRM routes — ErrorBoundary is inside CrmLayout */}
      <Route path="/admin/crm/dashboard" component={CrmExecutiveDashboard} />
      <Route path="/admin/crm" component={CrmHomeRedirect} />
      <Route path="/admin/crm/leads/:id/dna" component={CrmLeadDna} />
      <Route path="/admin/crm/leads/:id" component={CrmLeadDetail} />
      <Route path="/admin/crm/leads" component={CrmLeads} />
      <Route path="/admin/crm/communications" component={CrmCommunications} />
      <Route path="/admin/crm/intelligence/behavioral" component={CrmBehavioralIntelligence} />
      <Route path="/admin/crm/intelligence/automation-queue" component={CrmAutomationQueue} />
      <Route path="/admin/crm/inbox" component={CrmInbox} />
      <Route path="/admin/crm/tasks" component={CrmTasks} />
      <Route path="/admin/crm/calendar" component={CrmCalendar} />
      <Route path="/admin/crm/deals" component={CrmDeals} />
      <Route path="/admin/crm/projects" component={CrmProjects} />
      <Route path="/admin/crm/pipeline" component={CrmPipeline} />
      <Route path="/admin/crm/reporting" component={CrmReporting} />
      <Route path="/admin/crm/admin" component={CrmAdminSettings} />
      <Route path="/admin/crm/workspace" component={CrmWorkspaceLanding} />
      <Route path="/admin/crm/campaigns">{() => <CrmCampaigns />}</Route>
      <Route path="/admin/crm/campaign-builder" component={CrmCampaignBuilderPage} />
      <Route path="/admin/crm/campaign-queue" component={CrmCampaignQueuePage} />
      <Route path="/admin/crm/discovery" component={CrmDiscovery} />
      <Route path="/admin/crm/email-templates" component={CrmEmailTemplates} />
      <Route path="/admin/crm/import" component={CrmImport} />
      <Route path="/admin/crm/settings" component={CrmSettings} />

      {/* Discovery form — no main layout */}
      <Route path="/discovery" component={Discovery} />

      {/* Thank You — no main layout */}
      <Route path="/thank-you">{() => <ThankYou />}</Route>

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
