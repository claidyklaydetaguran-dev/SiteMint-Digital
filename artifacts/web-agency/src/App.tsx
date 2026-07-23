import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Discovery from "@/pages/Discovery";
import ThankYou from "@/pages/ThankYou";
import LandingLawyers from "@/pages/LandingLawyers";
import LandingRealtors from "@/pages/LandingRealtors";
import LandingReceptionist from "@/pages/LandingReceptionist";
import LandingReceptionistSignup from "@/pages/LandingReceptionistSignup";
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
import CrmTransactions from "@/pages/crm/CrmTransactions";
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
import CrmIntakeCases from "@/pages/crm/CrmIntakeCases";
import CrmReceptionistAccounts from "@/pages/crm/CrmReceptionistAccounts";
import { CrmErrorBoundary } from "@/components/CrmErrorBoundary";

const queryClient = new QueryClient();

// Production migration (2026-07-23): the approved SiteMint platform redesign
// is now the main production site. These are the same components that
// previously rendered at the flag-gated /platform-preview/* routes — reused
// as-is rather than copied — now serving /, /services, /portfolio,
// /pricing, /about, /contact directly, unconditionally (no feature flag).
// Still lazy-loaded so each route's chunk fetches only when actually
// visited.
const PlatformPreview = lazy(() => import("@/pages/PlatformPreview"));
const PlatformServicesPreview = lazy(() => import("@/pages/PlatformServicesPreview"));
const PlatformPricingPreview = lazy(() => import("@/pages/PlatformPricingPreview"));
const PlatformPortfolioPreview = lazy(() => import("@/pages/PlatformPortfolioPreview"));
const PlatformAboutPreview = lazy(() => import("@/pages/PlatformAboutPreview"));
const PlatformContactPreview = lazy(() => import("@/pages/PlatformContactPreview"));

// NOT migrated to production: PlatformDiscoveryPreview (the guided
// "Start a Project" form) and PlatformAiReceptionistPreview. See
// ROLLBACK / handoff notes — PlatformDiscoveryPreview's own shell submits
// nothing and isn't wired to a live endpoint, so "Start a Project" CTAs
// point at the real, working /discovery route instead (navConfig.ts's
// startProjectHref). PlatformAiReceptionistPreview was outside this
// migration's approved production-route list; Products > AI Receptionist
// links to the existing working /ai-receptionist landing page instead.
// Both component files remain in the repo, unreferenced, for later use.

function CrmHomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/admin/crm/dashboard"); }, [navigate]);
  return null;
}

function LegacyRedirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
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
      <Route path="/admin/crm/transactions" component={CrmTransactions} />
      <Route path="/admin/crm/projects" component={CrmProjects} />
      <Route path="/admin/crm/pipeline" component={CrmPipeline} />
      <Route path="/admin/crm/reporting" component={CrmReporting} />
      <Route path="/admin/crm/admin" component={CrmAdminSettings} />
      <Route path="/admin/crm/workspace" component={CrmWorkspaceLanding} />
      <Route path="/admin/crm/campaigns">{() => <CrmCampaigns />}</Route>
      <Route path="/admin/crm/campaign-builder" component={CrmCampaignBuilderPage} />
      <Route path="/admin/crm/campaign-queue" component={CrmCampaignQueuePage} />
      <Route path="/admin/crm/discovery" component={CrmDiscovery} />
      <Route path="/admin/crm/intake-cases" component={CrmIntakeCases} />
      <Route path="/admin/crm/receptionist-accounts" component={CrmReceptionistAccounts} />
      <Route path="/admin/crm/email-templates" component={CrmEmailTemplates} />
      <Route path="/admin/crm/import" component={CrmImport} />
      <Route path="/admin/crm/settings" component={CrmSettings} />

      {/* Discovery form — the real, working "Start a Project" funnel
          (posts to /api/discovery/submit). No main layout — self-contained. */}
      <Route path="/discovery" component={Discovery} />

      {/* Thank You — no main layout */}
      <Route path="/thank-you">{() => <ThankYou />}</Route>

      {/* Landing test pages — no main layout, unlisted */}
      <Route path="/ai-for-lawyers" component={LandingLawyers} />
      <Route path="/ai-for-realtors" component={LandingRealtors} />
      <Route path="/ai-receptionist/signup" component={LandingReceptionistSignup} />
      <Route path="/ai-receptionist" component={LandingReceptionist} />

      {/* ── Legacy AI Receptionist routes — redirect to helpdesk SPA ── */}
      <Route path="/app/login">
        {() => <LegacyRedirect to="/ai-receptionist/dashboard/login" />}
      </Route>
      <Route path="/app/conversations/:id">
        {() => <LegacyRedirect to="/ai-receptionist/dashboard/" />}
      </Route>
      <Route path="/app/agent-config">
        {() => <LegacyRedirect to="/ai-receptionist/dashboard/" />}
      </Route>
      <Route path="/app/settings">
        {() => <LegacyRedirect to="/ai-receptionist/dashboard/" />}
      </Route>
      <Route path="/app">
        {() => <LegacyRedirect to="/ai-receptionist/dashboard/" />}
      </Route>


      {/* Public site — the approved SiteMint platform redesign. Each page
          component owns its own shell (navbar, footer, theme) via
          PlatformPreviewPageShell — no main Layout wrapper here. */}
      <Route path="/">
        {() => (
          <Suspense fallback={null}>
            <PlatformPreview />
          </Suspense>
        )}
      </Route>
      <Route path="/services">
        {() => (
          <Suspense fallback={null}>
            <PlatformServicesPreview />
          </Suspense>
        )}
      </Route>
      <Route path="/portfolio">
        {() => (
          <Suspense fallback={null}>
            <PlatformPortfolioPreview />
          </Suspense>
        )}
      </Route>
      <Route path="/pricing">
        {() => (
          <Suspense fallback={null}>
            <PlatformPricingPreview />
          </Suspense>
        )}
      </Route>
      <Route path="/about">
        {() => (
          <Suspense fallback={null}>
            <PlatformAboutPreview />
          </Suspense>
        )}
      </Route>
      <Route path="/contact">
        {() => (
          <Suspense fallback={null}>
            <PlatformContactPreview />
          </Suspense>
        )}
      </Route>

      <Route component={NotFound} />
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
