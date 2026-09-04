/**
 * Frontend V2 Phase 9 — committed contract tests for the Current SMS
 * Receptionist workspace.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Same arrangement as Phases 5–8: the file lives beside the module it tests,
 * `scripts` owns the runner because it is the workspace package that already
 * has `tsx`, and helpdesk's tsconfig excludes `**\/*.test.ts` by glob so
 * nothing here is type-built into the app or bundled by Vite.
 *
 * Two kinds of assertion, both dependency-free:
 *
 *  1. **Behavioural.** `receptionistContract.ts` is pure and imported directly,
 *     so the response read, the validation, the save gate, the payload, the
 *     status derivation and the failure copy are executed rather than
 *     pattern-matched.
 *  2. **Structural.** The page, the router, the stylesheet and the protected
 *     backend route are read as source and checked for what a renderer would
 *     otherwise be needed to prove: the preserved endpoint and method, the
 *     absence of a fabricated status or phone number, the landmarks, the
 *     labelling, and the motion rules.
 *
 * No test framework, no DOM, no new dependency, and no frozen configuration
 * changed. It never performs a network request, never signs in, never creates a
 * session, and never contacts a provider.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIMITS,
  buildPayload,
  configurationGroups,
  deriveStatus,
  diffDraft,
  draftFrom,
  hasErrors,
  industryLabel,
  overwriteWarning,
  readAgentConfig,
  readFailure,
  readOnlyFields,
  saveAnnouncement,
  saveFailure,
  saveGate,
  validateDraft,
  type AgentConfigFields,
  type Draft,
} from "./receptionistContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/receptionist → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/AgentConfig.tsx");
const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const apiSrc = read("artifacts/helpdesk/src/lib/api.ts");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-receptionist.css");
const contractSrc = read("artifacts/helpdesk/src/pages/receptionist/receptionistContract.ts");
const serverSrc = read("artifacts/api-server/src/routes/receptionistAgentConfig.ts");
const shellSrc = read("artifacts/helpdesk/src/shells/DashboardShell.tsx");

/**
 * Source with comments stripped. These files explain at length what they
 * removed and why, so a prose mention of a deleted badge or a deleted preview
 * must never be mistaken for the thing still being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pageCode = stripComments(pageSrc);
const cssCode = stripComments(cssSrc);

// ─── Tiny runner ───────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  check(
    `${label} (got ${JSON.stringify(actual)})`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );
}

function section(name: string): void {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 66 - name.length))}`);
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

function fields(over: Partial<AgentConfigFields> = {}): AgentConfigFields {
  return {
    name: "Northgate Plumbing",
    industry: "home-services",
    greetingMessage: "Thanks for texting Northgate Plumbing.",
    businessDescription: "Emergency repairs and boiler servicing.",
    qualifyingQuestions: ["What is the problem?", "What is your postcode?"],
    ...over,
  };
}

const EMPTY = fields({
  greetingMessage: null,
  businessDescription: null,
  qualifyingQuestions: [],
  industry: null,
});

function draft(over: Partial<Draft> = {}): Draft {
  return {
    greetingMessage: "Thanks for texting Northgate Plumbing.",
    businessDescription: "Emergency repairs and boiler servicing.",
    qualifyingQuestions: ["What is the problem?", "What is your postcode?"],
    ...over,
  };
}

// ─── Route and navigation contract ─────────────────────────────────────────

section("route and navigation contract");

check(
  "the route is at /channels/sms, base-relative (2026-09 owner replan D-2/D-3: SMS is a channel under Channels; the ROUTES token was renamed from `receptionist` to `sms`, and the old /receptionist path is now a legacy redirect — see below)",
  routesSrc.includes('sms: "/channels/sms"'),
);
check(
  "the route still renders AgentConfig",
  appSrc.includes("<Route path={ROUTES.sms} component={AgentConfig} />"),
);
check(
  "route registration order still keeps Conversations and Contacts together, with SMS positioned by the Channels group",
  appSrc.indexOf("ROUTES.conversations") < appSrc.indexOf("ROUTES.contacts") &&
    appSrc.indexOf("ROUTES.contacts") < appSrc.indexOf("ROUTES.sms"),
);
check(
  "both the /deploy and /receptionist legacy redirects still target this route",
  appSrc.includes('<Route path="/receptionist">{() => <InSpaRedirect to={ROUTES.sms} />}</Route>') &&
    appSrc.includes('<Route path="/deploy">{() => <InSpaRedirect to={ROUTES.sms} />}</Route>'),
);
check(
  "the page is still lazy — the route keeps its own chunk",
  appSrc.includes('const AgentConfig = lazy(() => import("@/pages/AgentConfig"))'),
);
check(
  "paths stay base-relative so the root base and the configured prefix both work",
  routesSrc.includes("export const ROUTER_BASE") &&
    routesSrc.includes('RAW_BASE.replace(/\\/+$/, "")'),
);
check(
  "the route stays inside the authenticated DashboardShell",
  appSrc.includes("<DashboardShell>") && shellSrc.includes("<AppShell>"),
);
check(
  "the page adds no router base handling of its own",
  !pageCode.includes("BASE_URL") && !pageCode.includes("ROUTER_BASE"),
);

// ─── Authentication, session and tenant isolation ──────────────────────────

section("authentication, session and tenant isolation");

check(
  "the page performs no authentication of its own — the shell owns the session",
  !pageCode.includes("auth/me") && !pageCode.includes("auth/login") && !pageCode.includes("logout"),
);
check(
  "requests still carry the httpOnly session cookie",
  apiSrc.includes('credentials: "include"'),
);
check(
  "no firm, tenant or account identifier is ever sent — scoping is server-side",
  !/firmId|firm_id|tenant/i.test(pageCode) && !/firmId/i.test(stripComments(contractSrc)),
);
check(
  "the server still scopes both handlers to the session's firm",
  (serverSrc.match(/eq\(intakeFirms\.id, req\.firmId!\)/g) ?? []).length === 3,
);
check(
  "the server still requires receptionist auth on both methods",
  (serverSrc.match(/^\s*requireReceptionistAuth,$/gm) ?? []).length === 2,
);
check(
  "an expired session is a distinct, non-retryable outcome that offers sign-in",
  readFailure(401).sessionExpired && !readFailure(401).retryable,
);
check(
  "a save that hits an expired session says the changes are still on the page",
  saveFailure(401).sessionExpired && /still on this page/i.test(saveFailure(401).detail),
);
check(
  "a changed account re-seeds the form rather than showing the previous firm's text",
  pageCode.includes("accountChanged"),
);

// ─── The read contract ─────────────────────────────────────────────────────

section("read contract");

check(
  "the read path is unchanged",
  contractSrc.includes('export const AGENT_CONFIG_PATH = "/receptionist/agent-config"'),
);
check("the query key is unchanged", contractSrc.includes('AGENT_CONFIG_QUERY_KEY = "agent-config"'));
check(
  "the page reads through the shared apiFetch, adding no client of its own",
  pageCode.includes("apiFetch") && !/\bfetch\(/.test(pageCode) && !pageCode.includes("XMLHttpRequest"),
);
check(
  "the read is a plain GET — no method override is passed",
  pageCode.includes("apiFetch<unknown>(AGENT_CONFIG_PATH)"),
);
check(
  "no polling was introduced on this route",
  !/refetchInterval|setInterval/.test(pageCode),
);

section("the `firm` wrapper — the defect this phase corrects");

eq(
  "the documented wrapped shape is read",
  readAgentConfig({ firm: { name: "N", industry: null, greetingMessage: "hi", businessDescription: "d", qualifyingQuestions: ["q"] } }),
  { name: "N", industry: null, greetingMessage: "hi", businessDescription: "d", qualifyingQuestions: ["q"] },
);
eq(
  "a flat body is tolerated, so the page cannot regress if the wrapper moves",
  readAgentConfig({ greetingMessage: "hi", businessDescription: null, qualifyingQuestions: [] }),
  { name: null, industry: null, greetingMessage: "hi", businessDescription: null, qualifyingQuestions: [] },
);
check("an unrecognised body yields null, never an empty configuration", readAgentConfig({ nope: 1 }) === null);
check("a null body yields null", readAgentConfig(null) === null);
check("a string body yields null", readAgentConfig("boom") === null);
eq(
  "a null questions array reads as empty, not as undefined",
  readAgentConfig({ firm: { greetingMessage: null, businessDescription: null, qualifyingQuestions: null } })?.qualifyingQuestions,
  [],
);
eq(
  "non-string questions are dropped rather than rendered as [object Object]",
  readAgentConfig({ firm: { qualifyingQuestions: ["ok", 3, null, "fine"] } })?.qualifyingQuestions,
  ["ok", "fine"],
);
check(
  "the server does in fact wrap its response — the reason this reader exists",
  serverSrc.includes("res.json({\n        firm:") || /res\.json\(\{\s*firm:/.test(serverSrc),
);
check(
  "the page never reads a configuration field off the top level of the body",
  !/data\.(name|greetingMessage|businessDescription|qualifyingQuestions)/.test(pageCode),
);

// ─── No fabricated fallback configuration ──────────────────────────────────

section("no fabricated fallback configuration");

check(
  "a failed read renders a stated failure, not an empty form",
  pageCode.includes("readFailure(") && pageCode.includes("isError || !config"),
);
check(
  "the unknown state says settings could not be loaded — not that nothing is set up",
  deriveStatus(null).state === "unknown" &&
    /couldn.t be loaded/i.test(deriveStatus(null).title) &&
    !/not set up|nothing is configured/i.test(deriveStatus(null).title),
);
check(
  "the unknown state reassures that saved configuration is untouched",
  /untouched/i.test(deriveStatus(null).detail),
);
check(
  "no placeholder text stands in for a real value — the textareas have no placeholder",
  !pageCode.includes("placeholder="),
);
check(
  "the invented agency sample copy is gone from the page",
  !pageSrc.includes("$1,500") && !pageSrc.includes("web design agency"),
);
check(
  "a field the server did not send is omitted rather than shown blank",
  readOnlyFields(fields({ industry: null })).length === 1 &&
    readOnlyFields(fields({ name: null, industry: null })).length === 0,
);

// ─── Status: only what the evidence supports ───────────────────────────────

section("status — only what the evidence supports");

eq("all three saved reads as configured", deriveStatus(fields()).state, "configured");
eq("nothing saved reads as unconfigured", deriveStatus(EMPTY).state, "unconfigured");
eq(
  "some saved reads as incomplete",
  deriveStatus(fields({ businessDescription: null })).state,
  "incomplete",
);
eq(
  "whitespace is not configuration",
  deriveStatus(fields({ greetingMessage: "   ", businessDescription: "  ", qualifyingQuestions: ["  "] })).state,
  "unconfigured",
);
eq(
  "an incomplete state counts what is actually saved",
  deriveStatus(fields({ businessDescription: null })).completed,
  2,
);
eq(
  "the next action is the first outstanding setting",
  deriveStatus(fields({ greetingMessage: null, businessDescription: null })).next?.key,
  "greeting",
);
check("a configured firm has no outstanding next action", deriveStatus(fields()).next === null);
// The completed state claims completeness of configuration and nothing more.
// "Ready to answer" was rejected at owner review: answering depends on the SMS
// number and its provider webhook, neither of which this route can read.
eq("the completed state's heading", deriveStatus(fields()).title, "Setup complete");
check(
  "and its supporting copy claims only that the settings are saved",
  deriveStatus(fields()).detail ===
    "All three settings are saved. This page controls what your SMS Receptionist says. Review replies under Conversations.",
);
check(
  "the completed heading never implies delivery",
  !/\banswer|\bactive\b|\blive\b|\boperational\b|receiving/i.test(deriveStatus(fields()).title),
);

const allStatusCopy = [
  ...["unknown", "unconfigured", "incomplete", "configured"].map((_, i) =>
    [deriveStatus(null), deriveStatus(EMPTY), deriveStatus(fields({ businessDescription: null })), deriveStatus(fields())][i],
  ),
]
  .map((s) => `${s.title} ${s.detail}`)
  .join(" ");

check(
  "no status wording claims the receptionist is active, live, running or connected",
  !/\bactive\b|\blive\b|\brunning\b|\bconnected\b|\bonline\b/i.test(allStatusCopy),
);
// The exact phrases rejected at owner review, asserted individually so a
// regression names the offending phrase rather than failing a compound test.
for (const banned of [
  "Ready to answer",
  "Active",
  "Answering",
  "Operational",
  "Live",
  "Receiving messages",
]) {
  check(
    `no status copy anywhere says "${banned}"`,
    !new RegExp(`\\b${banned}\\b`, "i").test(allStatusCopy),
  );
}
check(
  "the truthful states owner review approved are unchanged",
  deriveStatus(fields({ businessDescription: null })).title.startsWith("Setup incomplete") &&
    deriveStatus(EMPTY).title === "Nothing is configured yet",
);
check(
  "the unreadable state still reports a read problem, not a setup problem",
  deriveStatus(null).state === "unknown",
);
check(
  "the hardcoded 'Active' badge is gone from the page",
  !/>\s*Active\s*</.test(pageSrc) && !pageCode.includes("statusbadge-success"),
);
check(
  "an unconfigured receptionist is styled as attention, never with the mint that means 'right'",
  cssCode.includes('.sr-status[data-state="unconfigured"]') &&
    /\.sr-status\[data-state="unconfigured"\] \.sd-status__dot\s*\{\s*background: var\(--sd-warn\)/.test(cssCode),
);
check(
  "the clean-state wording cannot contradict an unconfigured status",
  pageCode.includes("No unsaved changes") && !pageCode.includes("Everything here is saved"),
);
check(
  "the three settings match the Phase 7 overview checklist, so the surfaces agree",
  configurationGroups(fields()).map((g) => g.key).join(",") === "greeting,description,questions",
);

// ─── Capabilities that do not exist are not implied ────────────────────────

section("unsupported capabilities are removed, not disabled");

check(
  "the SMS phone number is never displayed — no endpoint under this session returns it",
  !/twilioNumber|twilio_number|phoneNumber|\+1\d|\bphone\b/i.test(pageCode),
);
check(
  "the server's agent-config handler indeed does not select twilioNumber",
  !serverSrc.includes("twilioNumber"),
);
check(
  "the fake SMS preview is gone — no simulated customer message or reply",
  !pageSrc.includes("PhonePreview") &&
    !pageSrc.includes("I need help with") &&
    !pageCode.includes("SMS Preview"),
);
check(
  "no chat bubble, phone frame or notch is rendered as decoration",
  !/rounded-\[28px\]|notch|bubble/i.test(pageCode) && !/bubble|notch/i.test(cssCode),
);
check(
  "the disabled 'Test' tab is gone rather than left as a dead control",
  !pageCode.includes("Coming soon") && !/>\s*Test\s*</.test(pageSrc),
);
check(
  "no control claims a send, activate, pause, resume, provision or delete capability",
  !/\bactivate|\bpause|\bresume|provision|\bsend (an? )?(sms|text|message)/i.test(pageCode),
);
check(
  "read-only fields are rendered as text, not as disabled inputs",
  pageCode.includes("sr-facts__value") && !pageCode.includes("disabled\n") && !/<input[^>]*disabled/.test(pageCode),
);
check(
  "read-only is stated in words, not implied by styling alone",
  pageCode.includes("Read-only here"),
);
check(
  "the read-only note says where the value can actually be changed",
  readOnlyFields(fields())[0]!.note.includes("Settings"),
);
eq("an unknown industry value is shown as sent, never dropped", industryLabel("aviation"), "aviation");
eq("a known industry value is given a readable label", industryLabel("home-services"), "Home services");

// ─── Validation, mirroring the server ──────────────────────────────────────

section("validation mirrors the server's own rules");

eq("the greeting limit matches the server", LIMITS.greeting, 500);
eq("the description limit matches the server", LIMITS.description, 1000);
eq("the question count limit matches the server", LIMITS.questions, 6);
eq("the question length limit matches the server", LIMITS.questionLength, 200);
check(
  "those four limits are the ones the server actually enforces",
  serverSrc.includes("MAX_GREETING    = 500") &&
    serverSrc.includes("MAX_DESCRIPTION = 1000") &&
    serverSrc.includes("MAX_QUESTIONS   = 6") &&
    serverSrc.includes("MAX_Q_LENGTH    = 200"),
);

check("a valid draft has no errors", !hasErrors(validateDraft(draft())));
check(
  "an over-long greeting is an error, not a silent truncation",
  Boolean(validateDraft(draft({ greetingMessage: "x".repeat(501) })).greetingMessage),
);
check(
  "a greeting exactly at the limit is accepted",
  !validateDraft(draft({ greetingMessage: "x".repeat(500) })).greetingMessage,
);
check(
  "an over-long description is an error",
  Boolean(validateDraft(draft({ businessDescription: "x".repeat(1001) })).businessDescription),
);
check(
  "a seventh question is an error",
  Boolean(validateDraft(draft({ qualifyingQuestions: Array(7).fill("q") })).questionsList),
);
check("six questions are accepted", !validateDraft(draft({ qualifyingQuestions: Array(6).fill("q") })).questionsList);
check(
  "a blank question row is an error against that row — the server rejects empty strings",
  validateDraft(draft({ qualifyingQuestions: ["ok", "   "] })).questions[1] !== undefined,
);
eq(
  "the error is keyed to the offending row, so it is announced against the right input",
  Object.keys(validateDraft(draft({ qualifyingQuestions: ["ok", "", "also ok", ""] })).questions),
  ["1", "3"],
);
check(
  "an over-long question is an error",
  Boolean(validateDraft(draft({ qualifyingQuestions: ["x".repeat(201)] })).questions[0]),
);
check(
  "the server still rejects an empty question, which is why a blank row cannot be sent",
  serverSrc.includes("q.trim().length === 0"),
);
// The payload is built in exactly one place, and that place drops nothing.
const buildPayloadSrc = stripComments(contractSrc).match(
  /export function buildPayload[\s\S]*?\n}/,
)?.[0] ?? "";
check(
  "the payload builder exists and filters nothing out",
  buildPayloadSrc.length > 0 && !buildPayloadSrc.includes(".filter("),
);
eq(
  "a blank row reaches the payload rather than vanishing — validation stops the save instead",
  buildPayload(draft({ qualifyingQuestions: ["ok", ""] })).qualifyingQuestions,
  ["ok", ""],
);
check(
  "the page sends exactly what buildPayload returns, with no further processing",
  pageCode.includes("mutation.mutate(buildPayload(draft))"),
);
check(
  "nothing is truncated with slice before sending",
  !pageCode.includes(".slice(0, 500)") && !pageCode.includes(".slice(0, 1000)"),
);

// ─── The update contract ───────────────────────────────────────────────────

section("update contract — endpoint, method and payload unchanged");

check("the method is unchanged", contractSrc.includes('AGENT_CONFIG_METHOD = "PATCH"'));
check("the page sends PATCH to the same path", pageCode.includes('method: "PATCH"') && pageCode.includes("apiFetch<unknown>(AGENT_CONFIG_PATH"));
eq(
  "the payload carries exactly the three keys the endpoint accepts",
  Object.keys(buildPayload(draft())).sort(),
  ["businessDescription", "greetingMessage", "qualifyingQuestions"],
);
eq(
  "values are sent as typed, unmodified",
  buildPayload(draft({ greetingMessage: "  padded  " })).greetingMessage,
  "  padded  ",
);
check(
  "the payload array is a copy, so a later edit cannot mutate a request in flight",
  (() => {
    const d = draft();
    const payload = buildPayload(d);
    d.qualifyingQuestions.push("late");
    return payload.qualifyingQuestions.length === 2;
  })(),
);
check(
  "the server still accepts exactly these three fields and no others",
  serverSrc.includes("const { greetingMessage, businessDescription, qualifyingQuestions } ="),
);
check(
  "no new endpoint, verb or resource was invented",
  !/"(POST|DELETE|PUT)"/.test(pageCode) &&
    // one import, one GET call site, one PATCH call site
    (pageCode.match(/apiFetch/g) ?? []).length === 3,
);

// ─── Save gate and duplicate-save prevention ───────────────────────────────

section("save gate and duplicate-save prevention");

const clean = { dirty: false, saving: false, configLoaded: true };
check("save is disabled with nothing changed", !saveGate(clean).enabled);
eq("and says why", saveGate(clean).reason, "No changes to save.");
check("save is enabled once something changes", saveGate({ ...clean, dirty: true }).enabled);
check(
  "save is disabled while a save is in flight — the duplicate-save guard",
  !saveGate({ ...clean, dirty: true, saving: true }).enabled,
);
check(
  "save is disabled before the configuration has loaded",
  !saveGate({ ...clean, dirty: true, configLoaded: false }).enabled,
);
// An invalid form keeps a live button on purpose. Disabling it would make the
// error impossible to reach: pressing Save is what reveals it.
check(
  "an invalid form does NOT disable save — a dead button can never explain itself",
  saveGate({ ...clean, dirty: true }).enabled,
);
check(
  "pressing save on an invalid form reveals the errors instead of sending",
  pageCode.includes("setSubmitAttempted(true)") &&
    /hasErrors\(validateDraft\(draft\)\)\) \{[\s\S]{0,400}return;/.test(pageCode),
);
check(
  "and moves focus to the first invalid field",
  pageCode.includes("querySelector<HTMLElement>('[aria-invalid=\"true\"]')") &&
    pageCode.includes("firstInvalid?.focus()"),
);
check(
  "errors are only revealed after a save attempt, so typing is not nagged at",
  pageCode.includes("submitAttempted ? errors."),
);
check(
  "every disabled state carries a reason, so the button is never mutely off",
  [clean, { ...clean, saving: true }, { ...clean, configLoaded: false }].every(
    (a) => saveGate(a).reason !== null,
  ),
);
check("an enabled save has no blocking reason", saveGate({ ...clean, dirty: true }).reason === null);
// Verified empirically against a real build: three clicks dispatched in one
// tick all read a stale `mutation.isPending` and all sent a PATCH. A ref is the
// only guard that acts within the same turn of the event loop.
check(
  "a synchronous latch refuses a second save in the same tick",
  pageCode.includes("const inFlight = useRef(false)") &&
    pageCode.includes("if (inFlight.current || mutation.isPending) return;") &&
    pageCode.includes("inFlight.current = true;"),
);
check(
  "the latch is released however the request ends, so a failure is retryable",
  /onSettled:\s*\(\)\s*=>\s*\{\s*inFlight\.current = false;/.test(pageCode),
);
check(
  "the latch is set only after validation passes, so an invalid click cannot jam it",
  pageCode.indexOf("if (hasErrors(validateDraft(draft)))") < pageCode.indexOf("inFlight.current = true;"),
);
check(
  "the handler re-validates before sending rather than trusting stale state",
  pageCode.includes("if (hasErrors(validateDraft(draft))) {"),
);
check(
  "the handler refuses to send when nothing changed, which the server would 400",
  pageCode.includes("if (!diff?.dirty) return;"),
);

// ─── Dirty tracking ────────────────────────────────────────────────────────

section("dirty tracking");

check("an untouched draft is clean", !diffDraft(draftFrom(fields()), fields()).dirty);
check("a changed greeting is dirty", diffDraft(draft({ greetingMessage: "new" }), fields()).greeting);
check("a reordered question list is dirty", diffDraft(draft({ qualifyingQuestions: ["What is your postcode?", "What is the problem?"] }), fields()).questions);
check("a removed question is dirty", diffDraft(draft({ qualifyingQuestions: ["What is the problem?"] }), fields()).questions);
eq("the change count is the number of groups touched", diffDraft(draft({ greetingMessage: "a", businessDescription: "b" }), fields()).count, 2);
check(
  "a null saved value and an empty box are the same thing, not a change",
  !diffDraft(draftFrom(EMPTY), EMPTY).dirty,
);
check(
  "seeding never invents a value for a null field",
  draftFrom(EMPTY).greetingMessage === "" && draftFrom(EMPTY).qualifyingQuestions.length === 0,
);
check(
  "seeding copies the array rather than aliasing the query cache",
  (() => {
    const config = fields();
    const d = draftFrom(config);
    d.qualifyingQuestions.push("x");
    return config.qualifyingQuestions.length === 2;
  })(),
);

// ─── Save states and user input preservation ───────────────────────────────

section("save states, failure and input preservation");

check("saving is announced", saveAnnouncement("saving") === "Saving your changes.");
check("success is announced only as a distinct state", saveAnnouncement("saved") === "Changes saved.");
check("idle announces nothing", saveAnnouncement("idle") === "");
check(
  "a failure announcement carries the reason, not just the word failed",
  saveAnnouncement("error", saveFailure(500)).includes("weren't saved"),
);
check(
  "saving and saved are different states, so success is never claimed early",
  pageCode.includes('setSaveStatus("saving")') && pageCode.includes('setSaveStatus("saved")'),
);
check(
  "saved is only set from the mutation's success handler",
  /onSuccess:[\s\S]{0,700}setSaveStatus\("saved"\)/.test(pageCode),
);
check(
  "there is no optimistic update — the cache is written only on success",
  !pageCode.includes("onMutate") && /onSuccess:[\s\S]{0,400}setQueryData/.test(pageCode),
);
check(
  "the cache is updated from the server's response, not from the draft",
  pageCode.includes("queryClient.setQueryData([AGENT_CONFIG_QUERY_KEY], updated)"),
);
check(
  "a failed save leaves the draft in place — nothing resets it on error",
  /onError:\s*\(\)\s*=>\s*setSaveStatus\("error"\)/.test(pageCode) &&
    !/onError[\s\S]{0,200}setDraft/.test(pageCode),
);
check(
  "a 500 says explicitly that nothing on the server changed",
  /nothing on the server changed/i.test(saveFailure(500).detail),
);
check("a 500 is retryable", saveFailure(500).retryable);
check("a 400 is retryable and points at the fields", saveFailure(400).retryable);
check("a 404 is not retryable", !saveFailure(404).retryable);
check(
  "a 401 offers sign-in rather than a retry that cannot work",
  saveFailure(401).sessionExpired && pageCode.includes('<Link href="/login"'),
);
check(
  "the failure branch renders an alert, so it cannot be a silent failure",
  /sr-savefail[\s\S]{0,120}role="alert"/.test(pageCode) || pageCode.includes('className="sr-savefail" role="alert"'),
);
check(
  "discarding changes restores the saved values rather than blanking the form",
  pageCode.includes("setDraft(draftFrom(config))"),
);
check(
  "a background refetch cannot overwrite unsaved work",
  pageCode.includes("const clean = current === null || !diffDraft(current, config).dirty"),
);

// ─── Starting drafts ───────────────────────────────────────────────────────

section("starting drafts are local examples, and say so");

check(
  "applying an example over existing configuration warns first",
  overwriteWarning(fields()) !== null,
);
check(
  "with nothing configured there is nothing to lose, so it does not warn",
  overwriteWarning(EMPTY) === null,
);
check(
  "the warning states that nothing is saved until the owner saves",
  /Nothing is saved until you choose Save changes/.test(overwriteWarning(fields())!),
);
check(
  "the example copy is local, never fetched",
  pageCode.includes("AGENT_TEMPLATES") && !pageCode.includes("templates"),
);
check(
  "the control says the wording is an example to edit, not trained behaviour",
  pageCode.includes("Start from an example"),
);

// ─── Copy discipline ───────────────────────────────────────────────────────

section("copy discipline");

const prose = [pageCode, stripComments(contractSrc)].join(" ");
const bannedClaims = [
  /train your ai/i,
  /teach your receptionist/i,
  /works 24\/7/i,
  /24\/7/,
  /never miss a lead/i,
  /always available/i,
  /intelligent conversations/i,
  /effortless/i,
  /guarantee/i,
  /instantly/i,
  /learns automatically/i,
  /book(s|ing)? (an )?appointment/i,
];
for (const pattern of bannedClaims) {
  check(`no promotional claim matching ${pattern}`, !pattern.test(prose));
}
const labelled = (text: string) => new RegExp(`>\\s*${text}\\s*<`).test(pageCode);
check(
  "buttons name their real action",
  labelled("Save changes") && labelled("Discard changes") && labelled("Retry") && labelled("Sign in"),
);
check(
  "the page does not call the configuration 'training' or the product a 'bot'",
  !/\btraining\b|\bchatbot\b|\bbot\b/i.test(pageCode),
);

// ─── Accessibility ─────────────────────────────────────────────────────────

section("accessibility");

// Three `<h1>` appear in source — the loading branch, the failure branch and
// the loaded page. They are mutually exclusive returns, so exactly one ever
// renders; what matters is that all three are the same title.
const h1Count = (pageCode.match(/<h1/g) ?? []).length;
const h1Titles = [...pageCode.matchAll(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/g)].map((m) => m[1]);
eq("every render branch has exactly one h1", h1Count, h1Titles.length);
check(
  "every branch's h1 is the same, and names the route",
  h1Titles.length === 3 && h1Titles.every((t) => t === "SMS receptionist"),
);
check("sections below the h1 use h2 — no heading level is skipped", !/<h3|<h4/.test(pageCode));
check(
  "every section is labelled by its own heading",
  (pageCode.match(/aria-labelledby=/g) ?? []).length >= 5,
);
check(
  "every editable control has a visible label element, not a placeholder",
  pageCode.includes('<label className="sr-field__label" htmlFor={id}>') &&
    pageCode.includes('<label className="sr-question__label" htmlFor={id}>'),
);
check(
  "help text is associated with its field rather than floating beside it",
  pageCode.includes("aria-describedby={error ? `${errorId} ${helpId}"),
);
check(
  "an invalid field is marked invalid for assistive technology",
  pageCode.includes('aria-invalid={error ? "true" : undefined}'),
);
check(
  "field errors are announced where they occur",
  (pageCode.match(/role="alert"/g) ?? []).length >= 3,
);
check(
  "save results are announced through a small polite region, not the whole form",
  pageCode.includes('role="status" aria-live="polite"') &&
    !/aria-live[\s\S]{0,60}sr-form/.test(pageCode),
);
check(
  "the disabled save button still explains itself to a screen reader",
  pageCode.includes("aria-describedby={gate.reason"),
);
check(
  "every interactive element is a real button, link or field",
  !/<div[^>]*onClick/.test(pageCode) && !/role="button"/.test(pageCode),
);
check(
  "icon-only controls carry an accessible name",
  (pageCode.match(/aria-label=/g) ?? []).length >= 3,
);
check("decorative icons are hidden from assistive technology", (pageCode.match(/aria-hidden="true"/g) ?? []).length >= 6);
check(
  "the loading state is announced and marked busy",
  pageCode.includes('aria-busy="true"') && pageCode.includes('role="status"'),
);
check(
  "the next-action link moves focus to the outstanding group's heading",
  pageCode.includes("tabIndex={-1}") && pageCode.includes("href={`#${headingId}-${status.next.key}`}"),
);
check(
  "interactive targets are at least 44px",
  (cssCode.match(/min-height: 44px|height: 44px/g) ?? []).length >= 4,
);
check(
  "focus is visible on every control this layer styles",
  (cssCode.match(/:focus-visible/g) ?? []).length >= 5,
);
check(
  "state is never carried by colour alone — the ledger prints the words",
  pageCode.includes('{group.set ? "Saved" : "Not set"}'),
);
check(
  "disabled controls stay legible rather than fading to a ghost",
  cssCode.includes(".sr-btn--primary:disabled") && cssCode.includes("color: var(--sd-muted-text)"),
);

// ─── Responsive ────────────────────────────────────────────────────────────

section("responsive behaviour");

check("the column is capped at a readable measure", cssCode.includes("max-width: 52rem"));
check("there is a narrow-viewport layer", cssCode.includes("@media (max-width: 40rem)"));
check(
  "the two-column read-only grid collapses on narrow screens",
  /@media \(max-width: 40rem\)[\s\S]*grid-template-columns: 1fr/.test(cssCode),
);
check(
  "the save bar is sticky in flow, so it can never cover a field",
  cssCode.includes("position: sticky") && !cssCode.includes("position: fixed"),
);
check(
  "the save bar respects the mobile safe area",
  cssCode.includes("padding-bottom: env(safe-area-inset-bottom"),
);
check(
  "a short viewport — landscape phone or 200% zoom — un-sticks the bar",
  cssCode.includes("@media (max-height: 34rem)"),
);
check(
  "the scroll container keeps focused fields clear of the sticky bar",
  cssCode.includes(".sd-workspace:has(.sr-page)") && cssCode.includes("scroll-padding-bottom"),
);
check(
  "on a phone the bar collapses when there is genuinely nothing to save",
  /@media \(max-width: 40rem\)[\s\S]*\.sr-savebar\[data-actions="false"\] \.sr-savebar__actions\s*\{\s*display: none/.test(cssCode),
);
check(
  "and the action returns the moment there is something to act on",
  pageCode.includes("mutation.isPending || saveStatus === \"saved\" || mutation.isError"),
);
check(
  "long unbroken values wrap instead of overflowing",
  cssCode.includes("overflow-wrap: anywhere"),
);
check(
  "textareas resize vertically only, so they cannot break the column",
  cssCode.includes("resize: vertical"),
);
check("nothing in this layer sets a horizontal scroll", !/overflow-x:\s*(scroll|auto)/.test(cssCode));
check(
  "hover effects are gated behind a fine pointer so touch never sticks",
  cssCode.includes("@media (hover: hover) and (pointer: fine)"),
);

// ─── Motion ────────────────────────────────────────────────────────────────

section("motion");

check(
  "only compositor-friendly properties are transitioned",
  !/transition:[^;]*\b(width|height|top|left|margin|padding|filter|background-position)\b/.test(cssCode),
);
check(
  "the only looping animation is the save spinner, and only while saving",
  (cssCode.match(/infinite/g) ?? []).length === 1 && cssCode.includes("sr-spin"),
);
check("there is no pulsing status indicator", !/pulse|glow|breathe/i.test(cssCode));
check("form fields are not staggered or revealed on scroll", !/animation-delay|nth-child\([^)]*\)\s*\{[^}]*animation/.test(cssCode));
check(
  "reduced motion removes transitions and stops the spinner",
  cssCode.includes("@media (prefers-reduced-motion: reduce)") &&
    /prefers-reduced-motion: reduce\)[\s\S]*\.sr-spin\s*\{\s*animation: none/.test(cssCode),
);
check("no animation triggers a request", !/animationend|onAnimationEnd|transitionend/.test(pageCode));
check("no scroll, wheel or pointer listener hijacks the page", !/addEventListener\(\s*["'](scroll|wheel|touchmove)/.test(pageCode));

// ─── Visual system ─────────────────────────────────────────────────────────

section("visual system");

check(
  "the layer defines no colour of its own — every value is a shell token",
  !/#[0-9a-f]{3,8}\b/i.test(cssCode) && !/\brgba?\(/.test(cssCode.replace(/env\([^)]*\)/g, "")),
);
check("no purple, indigo or ordinary green enters the palette", !/purple|indigo|violet|#00ff00|\bgreen\b/i.test(cssCode));
check("no tailwind colour utility carries meaning on this page", !/\b(bg|text|border)-(rose|amber|emerald|indigo|violet|purple|slate|gray)-\d{2,3}/.test(pageCode));
check("no remote request, font or asset is introduced", !/@import\s+url|https?:\/\//.test(cssCode) && !/https?:\/\//.test(pageCode));
check("no gradient, glass or glow", !/gradient|backdrop-filter|box-shadow:[^;]*\d+px\s+\d+px\s+\d+px[^;]*rgba?\([^)]*0\.[3-9]/i.test(cssCode));
check("no image, video or generated asset is referenced", !/url\(|<img|<video/.test(cssCode) && !/<img|<video/.test(pageCode));
check(
  "the shell stylesheet is imported alongside, not replaced",
  pageSrc.includes('import "@/styles/v2-dashboard.css"') &&
    pageSrc.includes('import "@/styles/v2-receptionist.css"'),
);
check(
  "the workspace is styled by its own namespace and does not redefine sd-* classes",
  !/^\.sd-[a-z-]+\s*\{/m.test(cssCode),
);
check(
  "not every section became a card — groups are separated by a rule, not boxed",
  (cssCode.match(/border-radius: var\(--sd-radius-card\)/g) ?? []).length <= 4,
);

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phase 9 receptionist contract tests passed.");
