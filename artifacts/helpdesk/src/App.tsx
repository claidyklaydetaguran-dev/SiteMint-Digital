import { useEffect, lazy } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ComingSoon } from "@/components/common/ComingSoon";
import { NAV_GROUPS } from "@/lib/nav";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { useAssistantSessionGuard } from "@/hooks/useAssistants";
import { ROUTER_BASE, ROUTES } from "@/lib/routes";
import { voiceRoutePages } from "@/routes/voiceRoutes";
import { DashboardShell } from "@/shells/DashboardShell";
import { AuthShell } from "@/shells/AuthShell";
import { PublicShell } from "@/shells/PublicShell";

/**
 * Frontend V2 Phase 1 — route-level code splitting.
 *
 * The dashboard previously shipped as a single chunk: 17 direct page imports,
 * zero lazy boundaries. Every page is now `lazy()`, imported inline at its own
 * call site (never through a barrel, which would defeat the split) — except the
 * voice-platform pages, whose imports live behind the AR-001J build boundary so
 * that a default-gated build does not emit them at all.
 *
 * Route paths, ordering, auth behaviour, and the voice-platform gating are
 * unchanged from the protected baseline.
 */

const Login = lazy(() => import("@/pages/Login"));
const PublicSchedule = lazy(() => import("@/pages/PublicSchedule"));
const Overview = lazy(() => import("@/pages/Overview"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const AgentConfig = lazy(() => import("@/pages/AgentConfig"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ContactDetail = lazy(() => import("@/pages/ContactDetail"));
const Settings = lazy(() => import("@/pages/Settings"));
const Billing = lazy(() => import("@/pages/Billing"));
// The seven voice-platform pages are the one exception, and AR-001J is why:
// an `import()` written here is emitted by every build, so a default-gated
// build shipped chunks it could never load. They come from the build boundary
// instead, which removes their imports from the graph — see routes/voiceRoutes.
const {
  Assistants,
  AssistantCreate,
  AssistantBuilderNew,
  AssistantBuilder,
  CallLogs,
  CallLogDetail,
  Appointments,
} = voiceRoutePages;
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

function InSpaRedirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

// Mounted at the app root, independent of route, so it observes every
// session transition (login, logout, expiry, firm switch) — see
// useAssistantSessionGuard for why this can't live inside AppShell alone.
function AssistantSessionGuard() {
  useAssistantSessionGuard();
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

// R1: the live voice destinations that need an intentional capability state
// when the flag is off (see the route block below). Empty when the platform
// is enabled — the real pages own those paths inside the gate.
const voiceUnavailableRoutes = voicePlatformEnabled
  ? []
  : NAV_GROUPS.flatMap((group) => group.items).filter(
      (item) => item.voiceGated && item.state === "live" && Boolean(item.href),
    );

function Router() {
  return (
    <Switch>
      <Route path={ROUTES.login}>
        {() => (
          <AuthShell>
            <Login />
          </AuthShell>
        )}
      </Route>
      {/* Public, unauthenticated scheduling page — no dashboard chrome, no session cookie required. */}
      <Route path={ROUTES.publicSchedule}>
        {() => (
          <PublicShell routeLabel="This booking page">
            {/* PublicSchedule reads `:slug` itself via useRoute — it takes no props. */}
            <PublicSchedule />
          </PublicShell>
        )}
      </Route>
      <Route>
        <DashboardShell>
          <Switch>
            <Route path={ROUTES.overview} component={Overview} />
            <Route path={ROUTES.conversations} component={Inbox} />
            <Route path={ROUTES.receptionist} component={AgentConfig} />
            <Route path={ROUTES.contacts} component={Contacts} />
            <Route path={ROUTES.contactDetail} component={ContactDetail} />
            <Route path={ROUTES.deploy}>
              {() => <InSpaRedirect to={ROUTES.receptionist} />}
            </Route>
            <Route path={ROUTES.settings} component={Settings} />
            <Route path={ROUTES.billing} component={Billing} />
            {voicePlatformEnabled && (
              <>
                <Route path={ROUTES.assistants} component={Assistants} />
                <Route path={ROUTES.assistantNew} component={AssistantCreate} />
                <Route path={ROUTES.assistantNewTab} component={AssistantBuilderNew} />
                <Route path={ROUTES.assistantDetail} component={AssistantBuilder} />
                <Route path={ROUTES.logs} component={CallLogs} />
                <Route path={ROUTES.logDetail} component={CallLogDetail} />
                <Route path={ROUTES.appointments} component={Appointments} />
              </>
            )}
            {/* R1 capability states: when the voice platform is NOT enabled,
                direct navigation to the three live voice destinations gets an
                intentional "not enabled yet" state instead of the branded
                404. Driven by the committed nav metadata; navigation
                visibility still follows the capability policy (these never
                appear in the rail), no action is exposed, and no backend
                enablement is implied. */}
            {voiceUnavailableRoutes.map((item) => (
              <Route key={item.key} path={item.href!}>
                <ComingSoon
                  title={item.label}
                  description="This area is part of the SiteMint voice platform. Voice features are certified and enabled per client — they are not active on this workspace yet, and nothing here is running in the background."
                  icon={item.icon}
                  availability="Not enabled on this workspace"
                />
              </Route>
            ))}
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
        </DashboardShell>
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
            {voicePlatformEnabled && <AssistantSessionGuard />}
            <WouterRouter base={ROUTER_BASE}>
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
