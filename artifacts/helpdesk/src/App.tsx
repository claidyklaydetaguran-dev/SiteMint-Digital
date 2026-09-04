import { useEffect, lazy } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, useParams } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ComingSoon } from "@/components/common/ComingSoon";
import { VoiceUnavailable } from "@/components/common/VoiceUnavailable";
import { NAV_GROUPS } from "@/lib/nav";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { useAssistantSessionGuard } from "@/hooks/useAssistants";
import { ROUTER_BASE, ROUTES, VOICE_CAPABILITY_PATHS } from "@/lib/routes";
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
 * Route paths, ordering, auth behaviour, and the voice-platform gating follow
 * the 2026-09 owner replan (D-2 navigation) — see `lib/routes.ts` and
 * `lib/nav.ts`. Scheduling (Availability, Appointment Types, Calendar,
 * Appointments, Test Booking) is deliberately **not** behind the voice gate
 * (owner decision B-1): those pages are imported inline below, alongside every
 * other always-on page. Only Assistant, Calls, Phone Number, Usage and Issues
 * still come from the `voiceRoutePages` build boundary.
 */

const Login = lazy(() => import("@/pages/Login"));
const PublicSchedule = lazy(() => import("@/pages/PublicSchedule"));
const PasswordReset = lazy(() => import("@/pages/PasswordReset"));
const PasswordResetComplete = lazy(() => import("@/pages/PasswordResetComplete"));

const Overview = lazy(() => import("@/pages/Overview"));
const Setup = lazy(() => import("@/pages/Setup"));

const Availability = lazy(() => import("@/pages/Availability"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const TestBooking = lazy(() => import("@/pages/TestBooking"));

const Inbox = lazy(() => import("@/pages/Inbox"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ContactDetail = lazy(() => import("@/pages/ContactDetail"));

const AgentConfig = lazy(() => import("@/pages/AgentConfig"));

const Billing = lazy(() => import("@/pages/Billing"));
const Settings = lazy(() => import("@/pages/Settings"));
const Support = lazy(() => import("@/pages/Support"));

// The nine voice-platform pages are the one exception, and AR-001J is why:
// an `import()` written here is emitted by every build, so a default-gated
// build shipped chunks it could never load. They come from the build boundary
// instead, which removes their imports from the graph — see routes/voiceRoutes.
const {
  Assistants,
  AssistantCreate,
  AssistantBuilderNew,
  AssistantBuilder,
  Calls,
  CallDetail,
  PhoneNumber,
  Usage,
  Issues,
} = voiceRoutePages;
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

function InSpaRedirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, []);
  return null;
}

/** Preserves the `:id` param across a legacy-path redirect. */
function InSpaRedirectToId({ base }: { base: string }) {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  useEffect(() => { navigate(`${base}/${params.id}`, { replace: true }); }, []);
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

// R1: when the voice platform flag is off, the live voice paths get an
// intentional capability state instead of the 404. The paths come from the
// always-bundled route table — deliberately NOT from the voice nav metadata,
// which the AR-001M content boundary forbids a disabled build from emitting.
const voiceUnavailablePaths = voicePlatformEnabled
  ? []
  : VOICE_CAPABILITY_PATHS;

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
      <Route path={ROUTES.passwordReset}>
        {() => (
          <AuthShell routeLabel="Password reset">
            <PasswordReset />
          </AuthShell>
        )}
      </Route>
      <Route path={ROUTES.passwordResetComplete}>
        {() => (
          <AuthShell routeLabel="Password reset">
            <PasswordResetComplete />
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
            <Route path={ROUTES.setup} component={Setup} />

            <Route path={ROUTES.availability} component={Availability} />
            <Route path={ROUTES.appointmentTypes}>
              {/* Availability reads its initial tab from `?tab=types` — see
                  `pages/availability/availabilityContract.ts`. */}
              {() => <InSpaRedirect to={`${ROUTES.availability}?tab=types`} />}
            </Route>
            <Route path={ROUTES.calendar} component={Calendar} />
            <Route path={ROUTES.appointments} component={Appointments} />
            <Route path={ROUTES.testBooking} component={TestBooking} />

            <Route path={ROUTES.conversations} component={Inbox} />
            <Route path={ROUTES.contacts} component={Contacts} />
            <Route path={ROUTES.contactDetail} component={ContactDetail} />

            <Route path={ROUTES.sms} component={AgentConfig} />

            <Route path={ROUTES.billing} component={Billing} />
            <Route path={ROUTES.settings} component={Settings} />
            <Route path={ROUTES.support} component={Support} />

            {voicePlatformEnabled && (
              <>
                <Route path={ROUTES.assistants} component={Assistants} />
                <Route path={ROUTES.assistantNew} component={AssistantCreate} />
                <Route path={ROUTES.assistantNewTab} component={AssistantBuilderNew} />
                <Route path={ROUTES.assistantDetail} component={AssistantBuilder} />
                <Route path={ROUTES.calls} component={Calls} />
                <Route path={ROUTES.callDetail} component={CallDetail} />
                <Route path={ROUTES.phoneNumber} component={PhoneNumber} />
                <Route path={ROUTES.usage} component={Usage} />
                <Route path={ROUTES.issues} component={Issues} />
              </>
            )}

            {/* Legacy redirects: every path a pre-replan build could reach
                still lands somewhere real, so no bookmark or external link
                404s. `replace: true` (in InSpaRedirect) keeps the old path out
                of browser history. */}
            <Route path="/conversations">{() => <InSpaRedirect to={ROUTES.conversations} />}</Route>
            <Route path="/contacts">{() => <InSpaRedirect to={ROUTES.contacts} />}</Route>
            <Route path="/contacts/:id">{() => <InSpaRedirectToId base={ROUTES.contacts} />}</Route>
            <Route path="/receptionist">{() => <InSpaRedirect to={ROUTES.sms} />}</Route>
            <Route path="/deploy">{() => <InSpaRedirect to={ROUTES.sms} />}</Route>
            <Route path="/settings">{() => <InSpaRedirect to={ROUTES.settings} />}</Route>
            <Route path="/billing">{() => <InSpaRedirect to={ROUTES.billing} />}</Route>
            <Route path="/appointments">{() => <InSpaRedirect to={ROUTES.appointments} />}</Route>
            <Route path="/logs">{() => <InSpaRedirect to={ROUTES.calls} />}</Route>
            <Route path="/logs/:id">{() => <InSpaRedirectToId base={ROUTES.calls} />}</Route>

            {/* R1 capability states: when the voice platform is NOT enabled, the
                live voice paths render a neutral capability state instead of
                the 404. Navigation visibility still follows the committed
                policy (nothing appears in the rail), no action is exposed, no
                backend enablement is implied — and the page stays inside the
                AR-001M content boundary: no voice-gated labels, descriptions,
                nav-only hrefs, or gated-only icons enter the disabled bundle. */}
            {voiceUnavailablePaths.map((path) => (
              <Route key={path} path={path}>
                <VoiceUnavailable />
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
