import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ROUTER_BASE, ROUTES, LEGACY_APP_ROUTES, DASHBOARD_URLS } from "@/lib/routes";
import { PublicShell } from "@/shells/PublicShell";
import { AuthShell } from "@/shells/AuthShell";
import { DashboardShell } from "@/shells/DashboardShell";

/**
 * Frontend V2 Phase 1 — route-level code splitting.
 *
 * Previously this module had 35 direct page imports against 8 lazy ones, so a
 * public visitor downloaded the entire internal CRM (26 `/admin/crm/*` pages,
 * ~1.13 MB of source) before seeing the homepage. Every route component is now
 * `lazy()`, and each is imported *inline at its own call site* rather than
 * through a shared barrel — a barrel would make every page reachable from one
 * module and collapse the split straight back into a single chunk.
 *
 * Only the router, the three shells, the providers, and the token layer remain
 * eager.
 *
 * Route paths, ordering, and redirect targets are unchanged from the protected
 * baseline; only *how* the components load changed.
 */

// ── Public marketing ────────────────────────────────────────────────────────
// Frontend V4 "Signal" (owner-approved implementation): the homepage renders
// HomeV4 under chrome="v4". V3 pages remain routed under the V4 chrome (the
// .v4-shell token remap re-skins their vocabulary); V3 components stay
// untouched as the rollback layer — ROLLBACK: swap HomeV4 back to HomeV3 and
// chrome="v4" back to "v3" to revert instantly.
const HomeV4 = lazy(() => import("@/pages/HomeV4"));
const HomeV3 = lazy(() => import("@/pages/HomeV3"));
const ServicesV3 = lazy(() => import("@/pages/ServicesV3"));
const WebsitesAppsV3 = lazy(() => import("@/pages/WebsitesAppsV3"));
const DiscoverySystemsV3 = lazy(() => import("@/pages/DiscoverySystemsV3"));
const AutomationV3 = lazy(() => import("@/pages/AutomationV3"));
const WorkV3 = lazy(() => import("@/pages/WorkV3"));
const ProcessV3 = lazy(() => import("@/pages/ProcessV3"));
const AboutV3 = lazy(() => import("@/pages/AboutV3"));
const InsightsV3 = lazy(() => import("@/pages/InsightsV3"));
const StartV3 = lazy(() => import("@/pages/StartV3"));
const LegalPrivacyV3 = lazy(() => import("@/pages/LegalPrivacyV3"));
const LegalTermsV3 = lazy(() => import("@/pages/LegalTermsV3"));
// Frontend V2 rollback references (unrouted or route-preserved):
const HomeV2 = lazy(() => import("@/pages/HomeV2"));
const PlatformPreview = lazy(() => import("@/pages/PlatformPreview"));
const PlatformServicesPreview = lazy(() => import("@/pages/PlatformServicesPreview"));
const PlatformPricingPreview = lazy(() => import("@/pages/PlatformPricingPreview"));
const PlatformPortfolioPreview = lazy(() => import("@/pages/PlatformPortfolioPreview"));
const PlatformAboutPreview = lazy(() => import("@/pages/PlatformAboutPreview"));
const PlatformContactPreview = lazy(() => import("@/pages/PlatformContactPreview"));
const ThankYou = lazy(() => import("@/pages/ThankYou"));
const NotFound = lazy(() => import("@/pages/not-found"));

// ── Discovery ───────────────────────────────────────────────────────────────
// The active /discovery route is the guided structured form (DiscoveryPage).
// Legacy discovery is kept for internal rollback only (/discovery/__legacy).
// ROLLBACK: swap DiscoveryPage back to Discovery to revert instantly.
const DiscoveryPage = lazy(() => import("@/pages/DiscoveryPage"));
const Discovery = lazy(() => import("@/pages/Discovery"));

// ── AI Receptionist public journey ──────────────────────────────────────────
// Frontend V4: the capability-honest Signal landing. V3 Voice Theater and the
// V2 page stay imported as rollback references — ROLLBACK: swap
// AiReceptionistV4 back to AiReceptionistV3 (chrome="v3") to revert instantly.
const AiReceptionistV4 = lazy(() => import("@/pages/AiReceptionistV4"));
const AiReceptionistV3 = lazy(() => import("@/pages/AiReceptionistV3"));
const AiReceptionist = lazy(() => import("@/pages/AiReceptionist"));
const LandingReceptionist = lazy(() => import("@/pages/LandingReceptionist"));
const LandingReceptionistSignup = lazy(() => import("@/pages/LandingReceptionistSignup"));

// ── Deferred verticals (owner decision 4) ───────────────────────────────────
// Removed from navigation and from the approved information architecture, but
// still routed so existing inbound links do not break. Source files are
// retained as rollback references and are NOT deleted in Phase 1.
const LandingLawyers = lazy(() => import("@/pages/LandingLawyers"));
const LandingRealtors = lazy(() => import("@/pages/LandingRealtors"));

// ── Internal admin / CRM ────────────────────────────────────────────────────
// Everything below is reachable only from a matched `/admin*` route, behind
// DashboardShell. This is what keeps the CRM out of the public entry graph.
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminSubmissionDetail = lazy(() => import("@/pages/AdminSubmissionDetail"));

const CrmExecutiveDashboard = lazy(() => import("@/pages/crm/CrmExecutiveDashboard"));
const CrmLeads = lazy(() => import("@/pages/crm/CrmLeads"));
const CrmLeadDetail = lazy(() => import("@/pages/crm/CrmLeadDetail"));
const CrmLeadDna = lazy(() => import("@/pages/crm/CrmLeadDna"));
const CrmPipeline = lazy(() => import("@/pages/crm/CrmPipeline"));
const CrmTasks = lazy(() => import("@/pages/crm/CrmTasks"));
const CrmEmailTemplates = lazy(() => import("@/pages/crm/CrmEmailTemplates"));
const CrmImport = lazy(() => import("@/pages/crm/CrmImport"));
const CrmSettings = lazy(() => import("@/pages/crm/CrmSettings"));
const CrmInbox = lazy(() => import("@/pages/crm/CrmInbox"));
const CrmCalendar = lazy(() => import("@/pages/crm/CrmCalendar"));
const CrmDeals = lazy(() => import("@/pages/crm/CrmDeals"));
const CrmTransactions = lazy(() => import("@/pages/crm/CrmTransactions"));
const CrmProjects = lazy(() => import("@/pages/crm/CrmProjects"));
const CrmReporting = lazy(() => import("@/pages/crm/CrmReporting"));
const CrmAdminSettings = lazy(() => import("@/pages/crm/CrmAdminSettings"));
const CrmCampaigns = lazy(() => import("@/pages/crm/CrmCampaigns"));
const CrmCampaignBuilderPage = lazy(() => import("@/pages/crm/CrmCampaignBuilderPage"));
const CrmCampaignQueuePage = lazy(() => import("@/pages/crm/CrmCampaignQueuePage"));
const CrmWorkspaceLanding = lazy(() => import("@/pages/crm/CrmWorkspaceLanding"));
const CrmDiscovery = lazy(() => import("@/pages/crm/CrmDiscovery"));
const CrmCommunications = lazy(() => import("@/pages/crm/CrmCommunications"));
const CrmBehavioralIntelligence = lazy(() => import("@/pages/crm/CrmBehavioralIntelligence"));
const CrmAutomationQueue = lazy(() => import("@/pages/crm/CrmAutomationQueue"));
const CrmIntakeCases = lazy(() => import("@/pages/crm/CrmIntakeCases"));
const CrmReceptionistAccounts = lazy(() => import("@/pages/crm/CrmReceptionistAccounts"));
const CrmNotFound = lazy(() => import("@/pages/crm/CrmLayout").then(m => ({ default: m.CrmNotFound })));

// ── Receptionist Ops (Operations owner, wp/operations) ──────────────────────
const CrmOpsFirms = lazy(() => import("@/pages/ops/CrmOpsFirms"));
const CrmOpsFirmDetail = lazy(() => import("@/pages/ops/CrmOpsFirmDetail"));
const CrmOpsIssues = lazy(() => import("@/pages/ops/CrmOpsIssues"));
const CrmOpsUsage = lazy(() => import("@/pages/ops/CrmOpsUsage"));
const CrmOpsNumbers = lazy(() => import("@/pages/ops/CrmOpsNumbers"));

const queryClient = new QueryClient();

function CrmHomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/admin/crm/dashboard"); }, [navigate]);
  return null;
}

function LegacyRedirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}

/**
 * Internal admin/CRM routes.
 *
 * Kept in its own component so the whole `/admin*` subtree sits behind one
 * lazy boundary and one chunk graph. `CrmErrorBoundary` continues to live
 * inside `CrmLayout`, exactly as before — unchanged.
 */
function AdminRoutes() {
  return (
    <Switch>
      {/* Admin routes — no main layout */}
      <Route path={ROUTES.adminLogin} component={AdminLogin} />
      <Route path={ROUTES.adminDashboard} component={AdminDashboard} />
      <Route path={ROUTES.adminSubmission} component={AdminSubmissionDetail} />

      {/* CRM routes — ErrorBoundary is inside CrmLayout */}
      <Route path="/admin/crm/dashboard" component={CrmExecutiveDashboard} />
      <Route path={ROUTES.crmHome} component={CrmHomeRedirect} />
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

      {/* Receptionist Ops (Operations owner) — firm detail registered before
          the firms list is irrelevant here since these are distinct paths,
          but the dynamic :id route must still be a separate, more specific
          entry than the bare list route. */}
      <Route path="/admin/ops/firms/:id" component={CrmOpsFirmDetail} />
      <Route path="/admin/ops/firms" component={CrmOpsFirms} />
      <Route path="/admin/ops/issues" component={CrmOpsIssues} />
      <Route path="/admin/ops/usage" component={CrmOpsUsage} />
      <Route path="/admin/ops/numbers" component={CrmOpsNumbers} />

      {/* 404 inside the CRM chrome (sidebar + breadcrumbs) rather than the
          bare public 404 card, for any unmatched /admin* deep link. */}
      <Route component={CrmNotFound} />
    </Switch>
  );
}

function Router() {
  return (
    <Switch>
      {/* ── Internal admin / CRM — DashboardShell, lazy chunk graph ──────────
          Two patterns so coverage is exact: `/admin` itself, and everything
          nested beneath it. Both render the same shell + subtree. */}
      <Route path="/admin">
        {() => (
          <DashboardShell routeLabel="The workspace">
            <AdminRoutes />
          </DashboardShell>
        )}
      </Route>
      {/* R1 fix (pre-existing defect inherited from main): wouter 3 matches
          with regexparam 3, which does NOT support the `:rest*` repeat
          syntax — it silently compiled to a single-segment matcher, so every
          admin/CRM URL deeper than one segment (e.g. /admin/crm/dashboard)
          fell through to the public 404. Verified identical on the untouched
          main baseline build. `*?` is the wouter-3 wildcard that matches the
          whole subtree. */}
      <Route path="/admin/*?">
        {() => (
          <DashboardShell routeLabel="The workspace">
            <AdminRoutes />
          </DashboardShell>
        )}
      </Route>

      {/* ── Discovery — the primary "Start Your Project" destination.
          Public, per owner decision 3. No main layout — self-contained with
          its own branded header. Behaviour and contracts unchanged. ─────── */}
      <Route path={ROUTES.discovery}>
        {() => (
          <PublicShell routeLabel="Discovery">
            <DiscoveryPage />
          </PublicShell>
        )}
      </Route>

      {/* Legacy discovery form — internal rollback only, not linked publicly. */}
      <Route path={ROUTES.discoveryLegacy}>
        {() => (
          <PublicShell routeLabel="Discovery">
            <Discovery />
          </PublicShell>
        )}
      </Route>

      {/* Thank You — Phase 2: first surface on the shared V2 chrome. It never
          had a shared header or footer of its own, so adopting the V2 shell
          adds navigation where there was none rather than replacing a design
          that a later phase still owns. */}
      <Route path={ROUTES.thankYou}>
        {() => (
          <PublicShell routeLabel="Thank you" chrome="v4">
            <ThankYou />
          </PublicShell>
        )}
      </Route>

      {/* ── Deferred vertical landings — unlinked, retained for rollback ─── */}
      <Route path={ROUTES.aiForLawyers}>
        {() => (
          <PublicShell routeLabel="This page">
            <LandingLawyers />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.aiForRealtors}>
        {() => (
          <PublicShell routeLabel="This page">
            <LandingRealtors />
          </PublicShell>
        )}
      </Route>

      {/* ── AI Receptionist ──────────────────────────────────────────────────
          Signup is registered BEFORE the landing page: `/ai-receptionist/signup`
          is a prefix-extension of `/ai-receptionist`, so the more specific
          route must match first. Do not reorder these two. */}
      <Route path={ROUTES.aiReceptionistSignup}>
        {() => (
          <AuthShell routeLabel="Signup">
            <LandingReceptionistSignup />
          </AuthShell>
        )}
      </Route>
      <Route path={ROUTES.aiReceptionist}>
        {() => (
          <PublicShell routeLabel="AI Receptionist" chrome="v4" heroTone="ink">
            <AiReceptionistV4 />
          </PublicShell>
        )}
      </Route>

      {/* ── Legacy AI Receptionist routes — redirect to helpdesk SPA ──────────
          Cross-application document navigations. These resolve through the
          centralised path layer and deliberately do NOT acquire the router
          base — the dashboard is a separate app with its own base. */}
      <Route path={LEGACY_APP_ROUTES.login}>
        {() => <LegacyRedirect to={DASHBOARD_URLS.login} />}
      </Route>
      <Route path={LEGACY_APP_ROUTES.conversation}>
        {() => <LegacyRedirect to={DASHBOARD_URLS.root} />}
      </Route>
      <Route path={LEGACY_APP_ROUTES.agentConfig}>
        {() => <LegacyRedirect to={DASHBOARD_URLS.root} />}
      </Route>
      <Route path={LEGACY_APP_ROUTES.settings}>
        {() => <LegacyRedirect to={DASHBOARD_URLS.root} />}
      </Route>
      <Route path={LEGACY_APP_ROUTES.root}>
        {() => <LegacyRedirect to={DASHBOARD_URLS.root} />}
      </Route>

      {/* ── Public site — Frontend V3 (Operational Editorial) ────────────────
          Every V3 surface renders under the shared V3 chrome. Ink-hero pages
          pass heroTone="ink"; editorial pages default to "light". V2 pages
          that V3 replaced stay imported above as rollback references. */}
      <Route path={ROUTES.home}>
        {() => (
          <PublicShell routeLabel="The homepage" chrome="v4" heroTone="ink">
            <HomeV4 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.services}>
        {() => (
          <PublicShell routeLabel="Services" chrome="v4">
            <ServicesV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.websitesApps}>
        {() => (
          <PublicShell routeLabel="Websites & Web Apps" chrome="v4">
            <WebsitesAppsV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.discoverySystems}>
        {() => (
          <PublicShell routeLabel="Discovery Systems" chrome="v4">
            <DiscoverySystemsV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.automation}>
        {() => (
          <PublicShell routeLabel="Workflow Automation" chrome="v4">
            <AutomationV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.workV3}>
        {() => (
          <PublicShell routeLabel="Our work" chrome="v4">
            <WorkV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.process}>
        {() => (
          <PublicShell routeLabel="Process" chrome="v4">
            <ProcessV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.insights}>
        {() => (
          <PublicShell routeLabel="Insights" chrome="v4">
            <InsightsV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.start}>
        {() => (
          <PublicShell routeLabel="Start with SiteMint" chrome="v4">
            <StartV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.privacy}>
        {() => (
          <PublicShell routeLabel="Privacy" chrome="v4">
            <LegalPrivacyV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.terms}>
        {() => (
          <PublicShell routeLabel="Terms" chrome="v4">
            <LegalTermsV3 />
          </PublicShell>
        )}
      </Route>
      {/* Legacy Work path — same V3 page, so inbound /portfolio links keep
          working. */}
      <Route path={ROUTES.work}>
        {() => (
          <PublicShell routeLabel="Our work" chrome="v4">
            <WorkV3 />
          </PublicShell>
        )}
      </Route>
      {/* Deferred (owner decision 4): out of navigation and IA, still routed. */}
      <Route path={ROUTES.pricing}>
        {() => (
          <PublicShell routeLabel="This page">
            <PlatformPricingPreview />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.about}>
        {() => (
          <PublicShell routeLabel="Company" chrome="v4">
            <AboutV3 />
          </PublicShell>
        )}
      </Route>
      <Route path={ROUTES.contact}>
        {() => (
          <PublicShell routeLabel="Contact">
            <PlatformContactPreview />
          </PublicShell>
        )}
      </Route>

      {/* 404 — V3 chrome. CONTENT-SPECIFICATION.md §7: never a blank screen. */}
      <Route>
        {() => (
          <PublicShell routeLabel="This page" chrome="v4">
            <NotFound />
          </PublicShell>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={ROUTER_BASE}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
