/**
 * Frontend V2 Phase 12 — committed contract tests for the Billing workspace.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Same arrangement as Phases 5–11: the file lives beside the module it tests,
 * `scripts` owns the runner because it is the workspace package that already
 * has `tsx`, and helpdesk's tsconfig excludes `**\/*.test.ts` by glob so nothing
 * here is type-built into the app or bundled by Vite.
 *
 * Much of this file asserts absence, and deliberately so. Billing is where an
 * interface is most tempted to invent — a price, a renewal date, a plan name, a
 * benefit list, a portal — and every one of those inventions is plausible enough
 * to survive a casual review. So every phrase the previous page displayed is
 * enumerated below and required to be gone from the source, from the contract
 * module, from the stylesheet and from the built output.
 *
 * No test framework, no DOM, no new dependency, and no frozen configuration
 * changed. It never performs a network request, never signs in, never creates a
 * session, never contacts Stripe and never contacts any provider.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ATTENTION_PERCENT,
  CHECKOUT_METHOD,
  CHECKOUT_PATH,
  CHECKOUT_TIMEOUT_MS,
  canUpgrade,
  checkoutCopy,
  checkoutEnabled,
  checkoutLabel,
  checkoutUrl,
  countOrNull,
  formatCount,
  isNotConfigured,
  isPaidPlan,
  isKnownPlan,
  LIMIT_REACHED_DETAIL,
  LOADING_MESSAGE,
  manualInvoicingCopy,
  METER_LABEL,
  NOT_AVAILABLE,
  PAID_LIMIT_DETAIL,
  nextView,
  pageCopy,
  planFields,
  planLabel,
  usageCopy,
  usageModel,
  views,
} from "./billingContract.js";

import { planLabel as settingsPlanLabel } from "../settings/settingsContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/billing → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Billing.tsx");
const contractSrc = read("artifacts/helpdesk/src/pages/billing/billingContract.ts");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-billing.css");
const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const sessionSrc = read("artifacts/helpdesk/src/hooks/useSession.ts");
const flagsSrc = read("artifacts/helpdesk/src/lib/featureFlags.ts");
const shellSrc = read("artifacts/helpdesk/src/components/layout/AppShell.tsx");
const billingRouteSrc = read("artifacts/api-server/src/routes/receptionistBilling.ts");
const intakeSrc = read("artifacts/api-server/src/routes/intakeAgent.ts");
const authRouteSrc = read("artifacts/api-server/src/routes/receptionistAuth.ts");

/**
 * Source with comments stripped. This route explains at length what it removed
 * and why — including quoting the removed phrases — so a prose mention of a
 * deleted claim must never be mistaken for the claim still being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pageCode = stripComments(pageSrc);
const contractCode = stripComments(contractSrc);
const cssCode = stripComments(cssSrc);
const routeCode = `${pageCode}\n${contractCode}`;

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

// ═══════════════════════════════════════════════════════════════════════════
// Premise — what the product actually exposes
// ═══════════════════════════════════════════════════════════════════════════

section("Premise — one mutation, no billing reads");

check(
  "the billing router exposes exactly one browser-reachable mutation",
  (billingRouteSrc.match(/router\.(get|post|put|patch|delete)\(/g) ?? []).length === 2 &&
    billingRouteSrc.includes('"/receptionist/billing/create-checkout-session"') &&
    billingRouteSrc.includes('"/receptionist/billing/webhook"'),
);

check(
  "the billing router exposes no GET at all",
  !/router\.get\(/.test(billingRouteSrc),
);

check(
  "no customer-portal, price, payment-method or invoice route exists",
  !/billingPortal|customer_portal|\/portal|\/prices|\/invoices|payment_method/i.test(
    billingRouteSrc,
  ),
);

check(
  "the not-configured branch answers with the phrase the page matches on",
  /STRIPE_RECEPTIONIST_PRICE_ID/.test(billingRouteSrc) &&
    /Billing is not configured yet/.test(billingRouteSrc),
);

check(
  "the success response carries a url and nothing else the page could display",
  /res\.json\(\{\s*url:\s*session\.url\s*\}\)/.test(billingRouteSrc),
);

check(
  "the session route returns only the three billing-relevant values",
  (() => {
    const block = /auth\/me[\s\S]{0,1400}/.exec(authRouteSrc)?.[0] ?? "";
    return (
      block.includes("planTier") &&
      block.includes("trialConversationsLimit") &&
      block.includes("conversationCount") &&
      !/stripeCustomerId|stripeSubscriptionId|price|renew|invoice/i.test(block)
    );
  })(),
);

// The single most important product fact this page states.
check(
  "the backend records the conversation before the trial cap suppresses the reply",
  (() => {
    const insertAt = intakeSrc.indexOf("await db.insert(intakeMessages)");
    const capAt = intakeSrc.indexOf("Trial cap check");
    return insertAt > -1 && capAt > -1 && insertAt < capAt;
  })(),
);

check(
  "the backend's own log line confirms only the automated reply is paused",
  /conversation logged but AI reply suppressed/.test(intakeSrc),
);

check(
  "the trial cap applies only to a non-paid plan",
  /isNewConversation && firm\.planTier !== "paid"/.test(intakeSrc),
);

// ═══════════════════════════════════════════════════════════════════════════
// Plan identity
// ═══════════════════════════════════════════════════════════════════════════

section("Plan identity — the approved label, reused not re-invented");

check(
  "the plan label is the Phase 11 helper itself, not a copy",
  planLabel === settingsPlanLabel,
);

check(
  "the contract module imports the label rather than defining one",
  /from ["']\.\.\/settings\/settingsContract\.js["']/.test(contractCode) &&
    !/function planLabel/.test(contractCode),
);

eq("a trial plan reads as the shared verified label", planLabel("trial"), "Free Trial");
eq("a paid plan reads as a neutral verified label", planLabel("paid"), "Paid plan");
eq(
  "an unrecognised plan is echoed verbatim, never renamed",
  planLabel("enterprise_legacy_2019"),
  "enterprise_legacy_2019",
);
eq("a blank plan yields no label at all", planLabel("   "), null);
eq("a null plan yields no label at all", planLabel(null), null);

check(
  "no verified label names a product this repository does not have",
  !/pro|premium|enterprise|unlimited|free tier/i.test(
    `${planLabel("paid")} ${planLabel("trial")}`,
  ),
);

// The shell's rail showed a *third* independent plan name ("Pro plan") beside
// the two the contract modules owned. It now reads from the same helper, so the
// invented product name cannot survive anywhere the operator can see it.
check(
  "the dashboard shell names the plan with the shared helper, not a literal",
  /import \{ planLabel \} from "@\/pages\/settings\/settingsContract"/.test(shellSrc) &&
    /planLabel\(planTier\)/.test(shellSrc) &&
    // Comment-stripped: the shell documents the string it removed.
    !/Pro plan/.test(stripComments(shellSrc)),
);

check(
  "isKnownPlan is re-exported unchanged",
  isKnownPlan("paid") && isKnownPlan("trial") && !isKnownPlan("enterprise_legacy_2019"),
);

eq("isPaidPlan is exact", [isPaidPlan("paid"), isPaidPlan("trial"), isPaidPlan("Paid"), isPaidPlan(null)], [true, false, false, false]);

// ═══════════════════════════════════════════════════════════════════════════
// Upgrade eligibility
// ═══════════════════════════════════════════════════════════════════════════

section("Upgrade eligibility — verified trial only");

eq("a verified trial plan is eligible", canUpgrade("trial"), true);
eq("a verified paid plan is not offered an upgrade", canUpgrade("paid"), false);
eq("an unknown plan is not offered an upgrade", canUpgrade("legacy_2019"), false);
eq("a blank plan is not offered an upgrade", canUpgrade("  "), false);
eq("a null plan is not offered an upgrade", canUpgrade(null), false);
eq("an undefined plan is not offered an upgrade", canUpgrade(undefined), false);
eq("eligibility is not case-tolerant — only the stored value counts", canUpgrade("Trial"), false);

check(
  // D-6: eligibility (a real trial account) is necessary but no longer
  // sufficient — the Stripe control also requires the checkoutEnabled()
  // build flag, so the two conditions must both appear on the gate.
  "the page renders the Upgrade section only behind trial eligibility AND the checkout-enabled flag",
  /eligible = canUpgrade\(/.test(pageCode) && /\{eligible && checkoutEnabled\(\) && \(/.test(pageCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// D-6 — manual invoicing during the private beta
// ═══════════════════════════════════════════════════════════════════════════

section("D-6 — Stripe checkout hidden; manual invoicing shown instead");

check(
  "checkoutEnabled reads the same VITE_* flag pattern every other flag in this app uses",
  contractSrc.includes('import.meta.env.VITE_BILLING_CHECKOUT_ENABLED === "true"'),
);
check(
  "outside a bundler (the plain tsx test runner) the flag defaults closed",
  checkoutEnabled() === false,
);
eq("the manual-invoicing title names the private beta", manualInvoicingCopy().title, "Billing during the private beta");
eq(
  "the manual-invoicing detail is the exact brief wording",
  manualInvoicingCopy().detail,
  "Billing during the private beta is handled by SiteMint (manual invoicing).",
);
check(
  "an eligible trial account sees the manual-invoicing notice when checkout is disabled",
  /\{eligible && !checkoutEnabled\(\) && \(/.test(pageCode) && pageCode.includes("manualInvoicingCopy()"),
);
check(
  "every checkout mechanic (path, mutation, response handling, copy) is still fully built — only its visibility changed",
  pageCode.includes("CHECKOUT_PATH") &&
    pageCode.includes("handleUpgrade") &&
    pageCode.includes("checkoutCopy()"),
);

// ═══════════════════════════════════════════════════════════════════════════
// Usage — counts
// ═══════════════════════════════════════════════════════════════════════════

section("Usage — a count that cannot be trusted is never used");

eq("zero is a real count", countOrNull(0), 0);
eq("a positive integer is a real count", countOrNull(17), 17);
eq("a negative count is rejected", countOrNull(-1), null);
eq("a fractional count is rejected", countOrNull(3.5), null);
eq("NaN is rejected", countOrNull(Number.NaN), null);
eq("Infinity is rejected", countOrNull(Number.POSITIVE_INFINITY), null);
eq("a numeric string is rejected, never coerced", countOrNull("12"), null);
eq("null is rejected", countOrNull(null), null);
eq("undefined is rejected", countOrNull(undefined), null);

eq("counts are grouped for readability", formatCount(1234567), "1,234,567");

// ═══════════════════════════════════════════════════════════════════════════
// Usage — the model
// ═══════════════════════════════════════════════════════════════════════════

section("Usage — thresholds, boundaries and division safety");

eq(
  "low usage on a trial plan is normal",
  usageModel("trial", 3, 20),
  { kind: "measured", used: 3, limit: 20, fill: 15, level: "normal" },
);

eq(
  "one conversation below the boundary is still normal",
  usageModel("trial", 15, 20).kind === "measured"
    ? (usageModel("trial", 15, 20) as { level: string }).level
    : "?",
  "normal",
);

// The exact boundary, at three different limits, so the rule is the ratio and
// not a number that happens to work at 20.
eq(
  "the exact 80% boundary is an attention state",
  usageModel("trial", 16, 20),
  { kind: "measured", used: 16, limit: 20, fill: 80, level: "approaching" },
);
eq(
  "the exact 80% boundary holds at a limit of 5",
  (usageModel("trial", 4, 5) as { level: string }).level,
  "approaching",
);
eq(
  "the exact 80% boundary holds at a limit of 250",
  (usageModel("trial", 200, 250) as { level: string }).level,
  "approaching",
);
eq(
  "just below the boundary at a limit of 250 is still normal",
  (usageModel("trial", 199, 250) as { level: string }).level,
  "normal",
);
eq("the documented threshold is the one that is applied", ATTENTION_PERCENT, 80);

eq(
  "at the limit the state is reached, not merely approaching",
  usageModel("trial", 20, 20),
  { kind: "measured", used: 20, limit: 20, fill: 100, level: "reached" },
);

eq(
  "over the limit the meter cannot overflow its track",
  usageModel("trial", 47, 20),
  { kind: "measured", used: 47, limit: 20, fill: 100, level: "reached" },
);

eq(
  "a zero limit yields no measurement and no division",
  usageModel("trial", 5, 0),
  { kind: "unmeasured", used: 5 },
);
eq(
  "a missing limit yields no measurement",
  usageModel("trial", 5, undefined),
  { kind: "unmeasured", used: 5 },
);
eq(
  "a negative limit yields no measurement",
  usageModel("trial", 5, -20),
  { kind: "unmeasured", used: 5 },
);
eq(
  "an unusable count on a trial plan yields no measurement",
  usageModel("trial", null, 20),
  { kind: "unmeasured", used: null },
);

eq("a paid plan is counted but not measured", usageModel("paid", 512, 20), {
  kind: "paid",
  used: 512,
});
eq("a paid plan with an unusable count still renders", usageModel("paid", null, 20), {
  kind: "paid",
  used: null,
});

eq("an unknown plan is never measured against a trial limit", usageModel("legacy", 9, 20), {
  kind: "unknown",
  used: 9,
});

check(
  "no model ever produces a non-finite fill",
  [
    usageModel("trial", 0, 1),
    usageModel("trial", 1, 1),
    usageModel("trial", 10, 3),
    usageModel("trial", 999999, 20),
  ].every((m) => m.kind === "measured" && Number.isFinite(m.fill) && m.fill >= 0 && m.fill <= 100),
);

check(
  "very large values stay exact rather than being rounded into a claim",
  (() => {
    const m = usageModel("trial", 1_000_000, 999_999);
    return m.kind === "measured" && m.used === 1_000_000 && m.level === "reached";
  })(),
);

// ═══════════════════════════════════════════════════════════════════════════
// Usage — the words
// ═══════════════════════════════════════════════════════════════════════════

section("Usage — the words, and the one claim about the backend");

eq(
  "a measured trial states both figures",
  usageCopy(usageModel("trial", 12, 20)).figure,
  "12 of 20",
);
eq(
  "an over-limit trial states the true counts, not a flattened 100%",
  usageCopy(usageModel("trial", 47, 20)).figure,
  "47 of 20",
);
check(
  "no usage copy ever states a percentage",
  ![
    usageCopy(usageModel("trial", 12, 20)),
    usageCopy(usageModel("trial", 16, 20)),
    usageCopy(usageModel("trial", 47, 20)),
    usageCopy(usageModel("paid", 12, 20)),
    usageCopy(usageModel("trial", 12, 0)),
    usageCopy(usageModel("legacy", 12, 20)),
  ].some((c) => /%|percent/i.test(`${c.figure} ${c.detail} ${c.status ?? ""}`)),
);

eq(
  "the at-limit sentence is exactly the one the backend supports",
  usageCopy(usageModel("trial", 20, 20)).detail,
  LIMIT_REACHED_DETAIL,
);
check(
  "the at-limit sentence says replies pause, never that leads stop",
  /recorded/.test(LIMIT_REACHED_DETAIL) &&
    /automated replies are paused/.test(LIMIT_REACHED_DETAIL) &&
    !/lead|lose|miss|stop receiving/i.test(LIMIT_REACHED_DETAIL),
);

eq(
  "a paid plan states only that the trial limit does not apply",
  usageCopy(usageModel("paid", 512, 20)).detail,
  PAID_LIMIT_DETAIL,
);
check(
  "the paid statement claims no allowance of its own",
  !/unlimited|no limit|as many|included|priority/i.test(PAID_LIMIT_DETAIL),
);

eq(
  "an unusable count is stated as unavailable, never as zero",
  usageCopy(usageModel("paid", null, 20)).figure,
  NOT_AVAILABLE,
);
eq(
  "an unmeasurable trial says so plainly and offers no ratio",
  usageCopy(usageModel("trial", 5, 0)).figure,
  "5",
);

eq(
  "the attention state is carried by a word, not only by colour",
  usageCopy(usageModel("trial", 16, 20)).status,
  "Approaching trial limit",
);
eq(
  "the reached state is carried by a word, not only by colour",
  usageCopy(usageModel("trial", 20, 20)).status,
  "Trial limit reached",
);
eq("a normal state names nothing", usageCopy(usageModel("trial", 2, 20)).status, null);
eq("a paid plan names nothing", usageCopy(usageModel("paid", 2, 20)).status, null);

// ═══════════════════════════════════════════════════════════════════════════
// The plan record
// ═══════════════════════════════════════════════════════════════════════════

section("Plan record — verified labels over verified values");

eq(
  "a trial record shows plan, usage and the trial limit",
  planFields(planLabel("trial"), usageModel("trial", 12, 20)),
  [
    { label: "Current plan", value: "Free Trial" },
    { label: "Conversation usage", value: "12 of 20" },
    { label: "Trial conversation limit", value: "20 conversations" },
  ],
);

eq(
  "a paid record shows no trial-limit row",
  planFields(planLabel("paid"), usageModel("paid", 512, 20)),
  [
    { label: "Current plan", value: "Paid plan" },
    { label: "Conversation usage", value: "512" },
  ],
);

eq(
  "an unknown plan is echoed and given no trial-limit row",
  planFields(planLabel("legacy_2019"), usageModel("legacy_2019", 9, 20)),
  [
    { label: "Current plan", value: "legacy_2019" },
    { label: "Conversation usage", value: "9" },
  ],
);

eq(
  "a blank plan omits the plan row entirely rather than guessing",
  planFields(planLabel(""), usageModel("", 9, 20)).map((f) => f.label),
  ["Conversation usage"],
);

check(
  "no record row is ever an editable control",
  // Element-anchored: a bare /select/ would match `aria-selected` on the tabs.
  !/<input|<select|<textarea|<form|contentEditable/i.test(pageCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Checkout — the mutation contract
// ═══════════════════════════════════════════════════════════════════════════

section("Checkout — method, path and single activation");

eq("the path is exact", CHECKOUT_PATH, "/api/receptionist/billing/create-checkout-session");
eq("the method is exact", CHECKOUT_METHOD, "POST");

check(
  "the page issues the mutation at that exact path and method",
  /fetch\(CHECKOUT_PATH,\s*\{[\s\S]{0,200}method:\s*["']POST["']/.test(pageCode),
);
check(
  "the mutation still sends the session cookie",
  /credentials:\s*["']include["']/.test(pageCode),
);
check(
  "the page performs exactly one fetch, and it is the checkout mutation",
  (pageCode.match(/fetch\(/g) ?? []).length === 1,
);
check(
  "no billing GET is issued anywhere on the route",
  !/method:\s*["']GET["']/.test(routeCode) &&
    !/useQuery|useMutation|apiFetch/.test(pageCode),
);

check(
  "a second activation while pending returns before reaching the network",
  /if \(checkout === "pending"\) return;/.test(pageCode),
);
check(
  "the button is disabled while pending as well",
  /disabled=\{checkout === "pending"\}/.test(pageCode),
);
check(
  "the pending state is exposed to assistive technology",
  /aria-busy=\{checkout === "pending"\}/.test(pageCode),
);

check(
  "the wait is bounded so pending can never be permanent",
  /Promise\.race/.test(pageCode) && /CHECKOUT_TIMEOUT_MS/.test(pageCode),
);
check("the bound is a real duration", CHECKOUT_TIMEOUT_MS > 0 && CHECKOUT_TIMEOUT_MS <= 30_000);

check(
  "checkout is reachable only from the button's own activation",
  (() => {
    // No effect, timer or lifecycle hook may call it.
    const effects = pageCode.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    return (
      effects.every((e) => !/handleUpgrade|CHECKOUT_PATH|fetch\(/.test(e)) &&
      /onClick=\{onUpgrade\}/.test(pageCode) &&
      !/setInterval|setTimeout\(handleUpgrade/.test(pageCode)
    );
  })(),
);

check(
  "no timer of any kind survives on the route",
  !/setInterval/.test(routeCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Checkout — responses
// ═══════════════════════════════════════════════════════════════════════════

section("Checkout — response handling");

eq("the deployment's not-configured answer is recognised", isNotConfigured("Billing is not configured yet"), true);
eq("recognition is case-insensitive", isNotConfigured("BILLING IS NOT CONFIGURED YET"), true);
eq("an unrelated failure is not mistaken for it", isNotConfigured("Failed to create checkout session"), false);
eq("a null error is not mistaken for it", isNotConfigured(null), false);
eq("an absent error is not mistaken for it", isNotConfigured(undefined), false);

eq(
  "an https Checkout URL is accepted",
  checkoutUrl("https://checkout.stripe.com/c/pay/cs_test_a1"),
  "https://checkout.stripe.com/c/pay/cs_test_a1",
);
eq(
  "a local intercepted URL is accepted, so QA never needs a live session",
  checkoutUrl("http://127.0.0.1:21622/qa/checkout-intercepted"),
  "http://127.0.0.1:21622/qa/checkout-intercepted",
);
eq("a javascript: payload is refused", checkoutUrl("javascript:alert(1)"), null);
eq("a data: payload is refused", checkoutUrl("data:text/html,<script>"), null);
eq("a relative path is refused", checkoutUrl("/billing"), null);
eq("an empty string is refused", checkoutUrl(""), null);
eq("a non-string is refused", checkoutUrl(42), null);
eq("a null url is refused", checkoutUrl(null), null);

check(
  "the page navigates only to a validated URL",
  /const url = checkoutUrl\(data\.url\);/.test(pageCode) &&
    /if \(url !== null\)/.test(pageCode) &&
    /window\.location\.href = url;/.test(pageCode),
);
check(
  "a refused or absent URL becomes a stated failure, never a silent no-op",
  /setCheckout\(isNotConfigured\(error\) \? "unavailable" : "failed"\)/.test(pageCode),
);
check(
  "the redirect is a redirect — no iframe, modal, popup or interstitial",
  !/<iframe|window\.open|Dialog|Modal|Popup/i.test(pageCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Checkout — the words
// ═══════════════════════════════════════════════════════════════════════════

section("Checkout — the words");

const cc = checkoutCopy();
eq("the upgrade heading is exact", cc.heading, "Upgrade");
eq("the upgrade description is exact", cc.detail, "Continue to Checkout to change your plan.");
eq("the button label is exact", cc.idleLabel, "Upgrade plan");
eq("the unavailable heading is exact", cc.unavailableTitle, "Billing isn’t available yet");
eq(
  "the unavailable body is exact",
  cc.unavailableDetail,
  "Checkout could not be started. Please try again later.",
);
eq("the error heading is exact", cc.errorTitle, "We couldn’t start Checkout");
eq(
  "the error body is exact",
  cc.errorDetail,
  "Try again. If the problem continues, return later.",
);
check(
  "the two failure headings are distinct states, not one message reused",
  cc.unavailableTitle !== cc.errorTitle && cc.unavailableDetail !== cc.errorDetail,
);
eq("the pending label states what is happening", checkoutLabel("pending"), "Starting Checkout…");
eq("an idle button offers the action", checkoutLabel("idle"), "Upgrade plan");
eq("a failed button offers the action again", checkoutLabel("failed"), "Upgrade plan");
eq("an unavailable button offers the action again", checkoutLabel("unavailable"), "Upgrade plan");

check(
  "the upgrade description promises a destination, not an outcome",
  !/guarantee|instantly|immediately|activate now|today/i.test(cc.detail),
);
check(
  "the unavailable copy names no address, date or roadmap",
  !/@|coming soon|soon|shortly|q[1-4]|release|roadmap/i.test(cc.unavailableDetail),
);
check(
  "no Checkout copy exposes provider configuration detail",
  !/stripe|price id|env|api key/i.test(
    `${cc.detail} ${cc.unavailableTitle} ${cc.unavailableDetail} ${cc.errorTitle} ${cc.errorDetail}`,
  ),
);
check(
  "retry is offered by re-activation only, never automatically",
  !/retry\(\)|autoRetry|attempts|setTimeout\(\s*\(\)\s*=>\s*handleUpgrade/i.test(pageCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Views
// ═══════════════════════════════════════════════════════════════════════════

section("Views — two local views, no route change, no request");

eq("there are exactly two views", views().map((v) => v.label), ["Plan", "Usage"]);
eq("arrow-right wraps", [nextView("plan", 1), nextView("usage", 1)], ["usage", "plan"]);
eq("arrow-left wraps", [nextView("plan", -1), nextView("usage", -1)], ["usage", "plan"]);

check(
  "the views are a real tab interface",
  /role="tablist"/.test(pageCode) &&
    /role="tab"/.test(pageCode) &&
    /role="tabpanel"/.test(pageCode) &&
    /aria-selected=\{view === item\.id\}/.test(pageCode) &&
    /aria-controls=\{`sb-panel-\$\{item\.id\}`\}/.test(pageCode) &&
    /aria-labelledby=\{`sb-tab-\$\{view\}`\}/.test(pageCode),
);
check(
  "the tab list uses a roving tabindex",
  /tabIndex=\{view === item\.id \? 0 : -1\}/.test(pageCode),
);
check(
  "arrow, Home and End keys all move between views",
  /ArrowRight/.test(pageCode) &&
    /ArrowLeft/.test(pageCode) &&
    /"Home"/.test(pageCode) &&
    /"End"/.test(pageCode),
);
check(
  "the tab list is a button, never a clickable generic div",
  !/<div[^>]*onClick/.test(pageCode) && !/<span[^>]*onClick/.test(pageCode),
);
check(
  "changing view changes state and nothing else",
  /onClick=\{\(\) => setView\(item\.id\)\}/.test(pageCode) &&
    !/navigate\(|setLocation\(|useLocation/.test(pageCode),
);
check(
  "no content is reachable in only one view by accident — both render from one model",
  /const model = usageModel\(/.test(pageCode) &&
    /<PlanView[\s\S]{0,200}model=\{model\}/.test(pageCode) &&
    /<UsageView model=\{model\} \/>/.test(pageCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Session and authentication
// ═══════════════════════════════════════════════════════════════════════════

section("Session — one source, no duplicate, no poll");

check(
  "the page reads the shell's existing session hook",
  /useSession\(\)/.test(pageCode) &&
    /from "@\/hooks\/useSession"/.test(pageSrc),
);
check(
  "the session query is the shared, cached entry",
  /staleTime:\s*60_000/.test(sessionSrc) && /SESSION_KEY/.test(sessionSrc),
);
check(
  "the page never requests /auth/me itself",
  !/auth\/me/.test(routeCode),
);
check(
  "no cache invalidation, refetch or query client is used",
  !/useQueryClient|invalidateQueries|refetch|refetchInterval|prefetch/.test(pageCode),
);
check(
  "no authenticated content renders before the session resolves",
  /if \(isLoading\)/.test(pageCode) &&
    /if \(!me\) return null;/.test(pageCode) &&
    pageCode.indexOf("if (isLoading)") < pageCode.indexOf("const model = usageModel("),
);
check(
  "the loading state is announced",
  /role="status"/.test(pageCode) && /aria-live="polite"/.test(pageCode),
);
eq("the loading message is stated once, in the contract", LOADING_MESSAGE, "Loading billing information…");

check(
  "no plan or usage value is ever defaulted when the session is absent",
  !/\?\?\s*20|\?\?\s*0\b|planTier\s*\|\|/.test(routeCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Accessibility
// ═══════════════════════════════════════════════════════════════════════════

section("Accessibility");

check("the route has exactly one h1", (pageCode.match(/<h1/g) ?? []).length === 1);
check(
  "every section carries an accessible name",
  (pageCode.match(/aria-labelledby="sb-|aria-label="/g) ?? []).length >= 4,
);
check(
  "heading order is h1 then h2, with no level skipped",
  /<h1/.test(pageCode) && /<h2/.test(pageCode) && !/<h4|<h5|<h6/.test(pageCode),
);
check(
  "the upgrade control is a real button with an explicit type",
  /<button[\s\S]{0,300}type="button"[\s\S]{0,300}className="sb-upgrade__action"/.test(pageCode),
);
check(
  "the meter carries accurate progress semantics",
  /role="progressbar"/.test(pageCode) &&
    /aria-valuemin=\{0\}/.test(pageCode) &&
    /aria-valuemax=\{model\.limit\}/.test(pageCode) &&
    /aria-valuenow=\{Math\.min\(model\.used, model\.limit\)\}/.test(pageCode) &&
    /aria-label=\{METER_LABEL\}/.test(pageCode),
);
check(
  "the meter's exact counts survive the clamp via valuetext",
  /aria-valuetext=/.test(pageCode),
);
eq("the meter has a real accessible name", METER_LABEL, "Trial conversation usage");
check(
  "the meter is drawn only where there is a denominator",
  /model\.kind === "measured" && \(\s*<div\s*\n?\s*className="sb-meter"/.test(pageCode) ||
    /\{model\.kind === "measured" && \(/.test(pageCode),
);
check(
  "failures are announced, and only the result box is a live region",
  (pageCode.match(/role="alert"/g) ?? []).length === 2 &&
    !/aria-live="assertive"/.test(pageCode),
);
check(
  "focus returns to the control that failed, and only on entering a failed state",
  /if \(checkout === "failed" \|\| checkout === "unavailable"\)/.test(pageCode) &&
    /upgradeRef\.current\?\.focus\(\)/.test(pageCode) &&
    /\}, \[checkout\]\);/.test(pageCode),
);
check(
  "every interactive target reserves at least 44px",
  (cssCode.match(/min-height:\s*44px/g) ?? []).length >= 2,
);
check(
  "focus is visible and uses the shared mint ring",
  (cssCode.match(/:focus-visible/g) ?? []).length >= 3 &&
    /--sd-focus-color/.test(cssCode),
);
check(
  "hover is never the only way to reveal anything",
  (() => {
    const blocks = cssCode.match(/@media \(hover: hover\)[\s\S]*?\n\}/g) ?? [];
    return blocks.every((b) => !/display:|visibility:|opacity:\s*1/.test(b));
  })(),
);
check(
  "the attention state is never carried by colour alone",
  /usage__status/.test(pageCode) && /copy\.status !== null/.test(pageCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Visual system
// ═══════════════════════════════════════════════════════════════════════════

section("Visual system — inherited, not re-invented");

check(
  "the stylesheet defines no colour of its own — every value is an --sd-* token",
  !/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(cssCode),
);
check(
  "no purple, indigo, ordinary green, emerald, rose or amber utility survives",
  !/purple|indigo|violet|emerald|rose-|amber-|green-[0-9]|lime|teal-[0-9]/i.test(
    `${cssCode}\n${pageCode}`,
  ),
);
check(
  "no gradient, glass or glow",
  !/gradient|backdrop-filter|box-shadow:[^;]*(?:0 0 |glow)/i.test(cssCode),
);
check(
  "no image, video or generated asset is referenced",
  !/url\(|<img|<svg|background-image/i.test(cssCode) && !/<img|\.png|\.jpg|\.svg/i.test(pageCode),
);
check(
  "the shell stylesheet is imported alongside, not replaced",
  /v2-dashboard\.css/.test(pageSrc) && /v2-billing\.css/.test(pageSrc),
);
check(
  "the workspace is styled by its own namespace and does not redefine sd-* classes",
  !/^\.sd-[a-z-]+\s*\{/m.test(cssCode),
);
check(
  "not every section became a card — the record is hairline rows",
  (cssCode.match(/border-radius:\s*var\(--sd-radius-card\)/g) ?? []).length <= 3,
);
check(
  "no shadcn component is reintroduced — the route uses the shell's own vocabulary",
  !/@\/components\/ui\//.test(pageSrc),
);
check(
  "no lucide icon is used as a decorative badge",
  !/lucide-react/.test(pageSrc),
);
check(
  "red is reserved for the one genuine error state",
  (cssCode.match(/--sd-danger/g) ?? []).length > 0 &&
    !/sb-usage|sb-meter|sb-fields/.test(
      (cssCode.match(/[^}]*--sd-danger[^}]*\}/g) ?? []).join(""),
    ),
);
check(
  "amber marks attention, and attention only",
  (cssCode.match(/--sd-warn/g) ?? []).length >= 2,
);

// ═══════════════════════════════════════════════════════════════════════════
// Motion
// ═══════════════════════════════════════════════════════════════════════════

section("Motion");

check("the layer adds no keyframes of its own", !/@keyframes/.test(cssCode));
check("no continuous or infinite animation", !/infinite|animation:/.test(cssCode));
check("the shared single entrance is used, and nothing is staggered", /sd-enter/.test(pageCode) && !/animation-delay/.test(cssCode));
check(
  "reduced motion is honoured locally as well as globally",
  /@media \(prefers-reduced-motion: reduce\)/.test(cssCode) &&
    /transition:\s*none/.test(cssCode),
);
check(
  "no usage figure is animated — the number is information, not an effect",
  !/countUp|counter|animate.*count/i.test(pageCode),
);
check(
  "transitions are limited to colour, width and transform",
  (() => {
    const props = (cssCode.match(/transition:[^;]+;/g) ?? []).join(" ");
    return !/height|margin|padding|top|left|font-size/.test(props);
  })(),
);

// ═══════════════════════════════════════════════════════════════════════════
// Unchanged contracts
// ═══════════════════════════════════════════════════════════════════════════

section("Unchanged — routing, navigation, flags");

check("the billing route path is unchanged", /billing:\s*"\/billing"/.test(routesSrc));
check(
  "the route registration is unchanged",
  /<Route path=\{ROUTES\.billing\} component=\{Billing\} \/>/.test(appSrc),
);
check("Billing is still lazily loaded", /const Billing = lazy\(/.test(appSrc));
check(
  "the navigation entry is unchanged and remains ungated",
  /key: "billing", label: "Billing", href: "\/billing"[\s\S]{0,80}voiceGated: false/.test(navSrc),
);
check(
  // D-6 adds exactly one flag, VITE_BILLING_CHECKOUT_ENABLED, read directly
  // in billingContract.ts rather than through the shared `lib/featureFlags.ts`
  // module that documents itself as the single import site for VITE_*
  // flags. That file is outside this session's edit scope (helpdesk
  // nav/shell/flags belong to a different owner); consolidating this flag
  // into it is reported to that owner rather than done here. No *other*
  // flag or voice-platform gating was introduced.
  "the route adds exactly the one documented D-6 flag, no voice-platform gating",
  (routeCode.match(/import\.meta\.env\.VITE_BILLING_CHECKOUT_ENABLED/g) ?? []).length >= 1 &&
    !/featureFlags|voicePlatformEnabled|VITE_VOICE/.test(routeCode),
);
check(
  "voice gating is untouched by this route",
  /voicePlatformEnabled/.test(flagsSrc) && !/VITE_VOICE/.test(routeCode),
);
check(
  "links are base-relative, so both root-base and prefixed builds resolve",
  !/href="\/ai-receptionist|href="http/.test(pageCode),
);

// ═══════════════════════════════════════════════════════════════════════════
// Removed content
// ═══════════════════════════════════════════════════════════════════════════

section("Removed — the invented product, its benefits and its portal");

const BANNED: [string, RegExp][] = [
  ["the invented product name", /\bPro\b(?!mise|gress|vider|tocol|perty|cess|ps\b)/],
  ["a priority AI claim", /priority\s+AI/i],
  ["a priority support claim", /priority\s+support/i],
  ["the unverified support address", /hello@sitemint/i],
  ["an unlimited-conversations claim", /unlimited/i],
  ["a full-history claim", /full\s+(conversation\s+)?history/i],
  ["a no-trial-cap benefit", /no\s+trial\s+cap/i],
  ["a security badge", /secured\s+by/i],
  ["the leads-stop claim", /keep\s+receiving\s+leads/i],
  ["an invented price", /\$\s?\d|\d+\s?(usd|eur|gbp)|per\s+month|\/mo\b|monthly\s+billing/i],
  ["a billing interval", /billed\s+(annually|monthly)|billing\s+cycle/i],
  ["a renewal date", /renew|next\s+payment|next\s+charge/i],
  ["an invoice history", /invoice|receipt/i],
  ["a payment method", /payment\s+method|card\s+ending|visa|mastercard/i],
  ["a customer portal", /customer\s+portal|manage\s+subscription|billing\s+portal/i],
  ["a subscription-management control", /cancel\s+subscription|change\s+plan\s+in/i],
  ["promotional urgency", /most\s+popular|best\s+value|recommended|limited\s+time|upgrade\s+today/i],
  ["a trial expiry date", /trial\s+ends|expires\s+on/i],
  ["seats or contract terms", /\bseats?\b|contract\s+term|refund\s+polic|\btax(es)?\b/i],
  ["a coming-soon promise", /coming\s+soon/i],
];

const bannedHits = (src: string) =>
  BANNED.filter(([, re]) => re.test(src)).map(([name]) => name);

eq("no removed phrase appears in the rendered page", bannedHits(pageCode), []);
eq("no removed phrase appears in the contract module's executable code", bannedHits(contractCode), []);
eq("no removed phrase appears in the stylesheet", bannedHits(cssSrc), []);

eq(
  "no removed phrase can be produced by any reachable state",
  (() => {
    const rendered = [
      ...views().map((v) => v.label),
      pageCopy().eyebrow,
      pageCopy().title,
      pageCopy().detail,
      LOADING_MESSAGE,
      METER_LABEL,
      NOT_AVAILABLE,
      ...Object.values(checkoutCopy()),
      ...(["trial", "paid", "legacy_2019", ""] as const).flatMap((tier) =>
        [
          [0, 20],
          [16, 20],
          [20, 20],
          [47, 20],
          [5, 0],
          [512, 20],
        ].flatMap(([used, limit]) => {
          const m = usageModel(tier, used, limit);
          const c = usageCopy(m);
          return [
            c.figure,
            c.detail,
            c.status ?? "",
            ...planFields(planLabel(tier), m).flatMap((f) => [f.label, f.value]),
          ];
        }),
      ),
    ].join("\n");
    return bannedHits(rendered);
  })(),
  [],
);

check(
  "nothing was replaced with a different invention — every string is in the contract",
  !/[A-Z][a-z]+ [a-z]+ [a-z]+ [a-z]+ [a-z]+/.test(
    // Long prose sentences must not be inlined in JSX; they live in the contract.
    (pageCode.match(/>[^<>{}]{40,}</g) ?? []).join(" "),
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
// Built output
// ═══════════════════════════════════════════════════════════════════════════

section("Built output — the removed content is absent from the bundle");

const distDir = path.join(repoRoot, "artifacts/helpdesk/dist/public/assets");
if (!existsSync(distDir)) {
  console.log("  SKIP  no built output present (run a production build to include these)");
} else {
  const billingChunks = readdirSync(distDir).filter((f) => /^Billing-.*\.js$/.test(f));
  check("exactly one Billing route chunk is emitted", billingChunks.length === 1);

  /**
   * The Billing route's built graph: its own chunk plus the sibling chunks it
   * statically imports, excluding the shared application entry.
   *
   * `planLabel` lives in the shared `settingsContract-*` chunk, so scanning
   * `Billing-*.js` alone would let a plan-name claim escape this check simply
   * by being hoisted. The graph is followed instead.
   */
  const routeGraph = (entry: string, includeEntryChunk: boolean): string[] => {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.shift()!;
      if (seen.has(file) || !existsSync(path.join(distDir, file))) continue;
      seen.add(file);
      const src = readFileSync(path.join(distDir, file), "utf8");
      for (const m of src.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) {
        if (includeEntryChunk || !/^index-/.test(m[1]!)) queue.push(m[1]!);
      }
    }
    return [...seen];
  };
  const join = (files: string[]) =>
    files.map((f) => readFileSync(path.join(distDir, f), "utf8")).join("\n");

  const built = join(routeGraph(billingChunks[0]!, true));
  const routeOnly = join(routeGraph(billingChunks[0]!, false));
  const wholeBundle = join(readdirSync(distDir).filter((f) => f.endsWith(".js")));

  eq("no removed phrase survives into the built Billing code", bannedHits(routeOnly), []);
  check(
    "the plan label reaches the built output from the shared helper",
    built.includes("Paid plan") && built.includes("Free Trial"),
  );
  // The three surfaces that name a plan — rail, Settings, Billing — now share
  // one mapping, so the invented name must exist in no chunk at all.
  check(
    "the invented product name is absent from every emitted chunk",
    !/Pro plan|Pro \(Paid\)/.test(wholeBundle),
  );
  check(
    "the built chunk contains the approved at-limit sentence",
    built.includes("automated replies are paused"),
  );
  check(
    "the built chunk contains the approved unavailable copy",
    built.includes("Checkout could not be started"),
  );
  check(
    "the built chunk references exactly one billing endpoint",
    (built.match(/receptionist\/billing\/[a-z-]+/g) ?? []).every(
      (m) => m === "receptionist/billing/create-checkout-session",
    ),
  );
  check(
    "the built chunk contains no billing GET, portal or price path",
    !/billing\/status|billing\/portal|billing\/price|billing\/invoices|payment_method/i.test(built),
  );
  check(
    "the built chunk contacts no provider directly",
    !/stripe\.com|js\.stripe|checkout\.stripe/i.test(built),
  );

  const cssFiles = readdirSync(distDir).filter((f) => /^Billing-.*\.css$/.test(f));
  check("a dedicated Billing stylesheet is emitted", cssFiles.length === 1);

  // No route may pull a remote font into the graph.
  const allCss = readdirSync(distDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(path.join(distDir, f), "utf8"))
    .join("\n");
  check(
    "no remote font is requested by any emitted stylesheet",
    !/@import\s+url\(|fonts\.googleapis|fonts\.gstatic|https?:\/\/[^)]*\.woff/i.test(allCss),
  );
}

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phase 12 billing contract tests passed.");
