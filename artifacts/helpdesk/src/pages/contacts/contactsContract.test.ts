/**
 * Frontend V2 Phase 10 — committed contract tests for the Contacts workspace.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 *
 * Same arrangement as Phases 5–9: the file lives beside the module it tests,
 * `scripts` owns the runner because it is the workspace package that already
 * has `tsx`, and helpdesk's tsconfig excludes `**\/*.test.ts` by glob so
 * nothing here is type-built into the app or bundled by Vite.
 *
 * The central assertion of this file is negative, and deliberately so. Phase 10
 * established that the receptionist surface has **no contact records and no
 * contact endpoint**, so most of what a contacts test would normally cover —
 * rows, selection, search, pagination — must be proven *absent* rather than
 * correct. A regression here does not look like a broken list; it looks like a
 * plausible list that was invented.
 *
 * No test framework, no DOM, no new dependency, and no frozen configuration
 * changed. It never performs a network request, never signs in, never creates a
 * session, and never contacts a provider.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  availabilityCopy,
  conversationsDestination,
  detailCopy,
  recordedCount,
  recordedFields,
} from "./contactsContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/pages/contacts → src/pages → src → helpdesk → artifacts → repo root
const repoRoot = path.resolve(here, "../../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pageSrc = read("artifacts/helpdesk/src/pages/Contacts.tsx");
const detailSrc = read("artifacts/helpdesk/src/pages/ContactDetail.tsx");
const appSrc = read("artifacts/helpdesk/src/App.tsx");
const routesSrc = read("artifacts/helpdesk/src/lib/routes.ts");
const navSrc = read("artifacts/helpdesk/src/lib/nav.ts");
const cssSrc = read("artifacts/helpdesk/src/styles/v2-contacts.css");
const contractSrc = read("artifacts/helpdesk/src/pages/contacts/contactsContract.ts");
const schemaSrc = read("lib/db/src/schema/intakeAgent.ts");

/**
 * Source with comments stripped. These files explain at length what they
 * removed and why, so a prose mention of a deleted directory or a fabricated
 * field must never be mistaken for the thing still being rendered.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const pageCode = stripComments(pageSrc);
const detailCode = stripComments(detailSrc);
const cssCode = stripComments(cssSrc);
const contractCode = stripComments(contractSrc);
const bothPages = `${pageCode}\n${detailCode}`;

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

// ─── The premise: no contact contract exists ───────────────────────────────

section("Premise — the product has no contact records");

check(
  "the receptionist schema defines no contacts table",
  !/pgTable\(\s*"[a-z_]*contact/i.test(schemaSrc),
);

check(
  "intake_conversations identifies a person only by caller_phone",
  schemaSrc.includes('callerPhone:   text("caller_phone").notNull()') &&
    !/intakeConversations[\s\S]*?\}\);/.exec(schemaSrc)?.[0]?.includes('text("name")'),
);

check(
  "no contact name, email or company column exists on a conversation or case",
  (() => {
    const conv = /export const intakeConversations[\s\S]*?\}\);/.exec(schemaSrc)?.[0] ?? "";
    const cases = /export const intakeCases[\s\S]*?\}\);/.exec(schemaSrc)?.[0] ?? "";
    return !/\b(name|email|company)\b/.test(conv) && !/\b(name|email|company)\b/.test(cases);
  })(),
);

// ─── No request is made ────────────────────────────────────────────────────

section("Requests — the route calls nothing");

check(
  "neither page imports the API client",
  !bothPages.includes("apiFetch") && !bothPages.includes('from "@/lib/api"'),
);

check(
  "neither page opens a query, mutation or cache entry",
  !/useQuery|useMutation|useQueryClient|queryKey/.test(bothPages),
);

check(
  "no fetch, XHR or polling interval anywhere on the route",
  !/fetch\(|XMLHttpRequest|refetchInterval|setInterval|setTimeout/.test(bothPages),
);

// Comments are stripped first: these files argue at length about the CRM
// endpoint they must not call, and naming it in prose is the opposite of
// calling it.
check(
  "the CRM admin contacts endpoint is never referenced in executable code",
  !/helpdesk\/contacts/.test(bothPages) && !/helpdesk\/contacts/.test(contractCode),
);

check(
  "no Authorization/Bearer header is constructed — the two auth systems stay separate",
  !/Authorization|Bearer|localStorage/.test(bothPages),
);

check(
  "no firm identifier is sent from the client — scoping stays server-side",
  !/firmId|firm_id/.test(bothPages),
);

// ─── Nothing is fabricated ─────────────────────────────────────────────────

section("Truth — no invented directory, record or capability");

/**
 * The phrases this route must never contain, matched by fragments rather than
 * spelled out, so enforcing their absence does not reintroduce them into the
 * source. Each covers one claim the repository cannot support:
 *  • a call log / per-contact tier / scoring of people — the old page's promises
 *  • historical completeness of the conversation set
 *  • the detail route "pointing at" a record that was looked up and missing
 *  • a claim about what this *account* stores, rather than the product
 */
const BANNED = [
  /call\s+hist/i,
  /tier\s+break/i,
  /lead\s+scor/i,
  /contact\s+directory\s+coming/i,
  /every\s+number\s+that\s+has\s+texted/i,
  /\ball\s+numbers\b/i,
  /points\s+at\s+a\s+contact\s+record/i,
  /this\s+account\s+keeps\s+no\s+contact\s+records/i,
];

const bannedHits = (src: string) => BANNED.filter((re) => re.test(src)).map(String);

check(
  "no unsupported claim appears in the rendered pages",
  bannedHits(bothPages).length === 0,
);

check(
  "no unsupported claim appears in the contract module's executable code",
  bannedHits(contractCode).length === 0,
);

check(
  "no unsupported claim appears anywhere in the route's source, comments included",
  bannedHits(`${pageSrc}\n${detailSrc}\n${contractSrc}\n${cssSrc}`).length === 0,
);

check(
  "the developer placeholder 'Contact Detail stub' is no longer rendered",
  !detailCode.includes("Contact Detail stub"),
);

check(
  "no search, filter or sort control is rendered over zero records",
  !/<input|SearchInput|placeholder=|role="search"|onChange=/.test(bothPages),
);

check(
  "no list, row, table or selection state is rendered",
  !/<table|<tbody|role="row"|aria-selected|selectedId|setSelected/.test(bothPages),
);

check(
  "no pagination, cursor or record count is rendered",
  !/page(Size|Number)|cursor|hasNextPage|totalCount|\bof \d+\b/.test(bothPages),
);

check(
  "no fabricated lifecycle, lead or activity vocabulary appears",
  !/\b(lead|prospect|qualified|hot|cold|engaged|unread|last contacted|pipeline|active now)\b/i.test(
    bothPages,
  ),
);

check(
  "no fabricated identity — no initials, avatar or generated name",
  !/initials|avatar|getInitials|placeholderName|charAt\(0\)/i.test(bothPages),
);

check(
  "no sample or seeded contact fixture ships in the page",
  !/例|John Doe|Jane |555-|@example\.com|sampleContacts|MOCK_/i.test(bothPages),
);

check(
  "no outbound action is offered — no send, call, email or composer",
  !/Send message|Start conversation|Call |Email |<textarea|composer/i.test(bothPages),
);

// Case-sensitive: a UI control is capitalised, whereas `export default` is the
// module keyword. Matching case-insensitively would flag the latter.
check(
  "no create, edit, delete, import, export or merge control",
  !/\b(Add contact|New contact|Edit|Delete|Archive|Import|Export|Merge)\b/.test(bothPages),
);

check(
  "the route renders no buttons at all — its only controls are links",
  !/<button|<Button/.test(bothPages),
);

check(
  "the detail route never echoes the URL identifier back into the page",
  !/useParams|useRoute|params\.id|\bprops\.id\b/.test(detailCode),
);

// ─── Behaviour of the contract module ──────────────────────────────────────

section("Contract module");

eq("availability is neutral, not an error or a warning", availabilityCopy().tone, "neutral");

// ── The owner-approved contract-bound wording, asserted verbatim ───────────

eq(
  "status heading is the approved wording",
  availabilityCopy().title,
  "No separate contact records are stored",
);

eq(
  "status body is the approved wording",
  availabilityCopy().detail,
  "Your SMS Receptionist identifies conversations by the phone number they come from. It does not store a separate contact directory.",
);

check(
  "the status copy describes the product, not this account's stored data",
  !/\b(this|your)\s+account\b/i.test(
    `${availabilityCopy().title} ${availabilityCopy().detail}`,
  ),
);

eq(
  "the phone-number description is the approved wording",
  recordedFields().find((f) => f.label === "Phone number")?.detail,
  "The phone number the conversation comes from. This is the only person identifier available here.",
);

eq(
  "the name description is the approved wording",
  recordedFields().find((f) => f.label === "Name")?.detail,
  "Not collected. The SMS Receptionist does not ask for or store a name.",
);

eq(
  "the email description is the approved wording",
  recordedFields().find((f) => f.label === "Email address")?.detail,
  "Not collected by the SMS Receptionist.",
);

eq(
  "the company description is the approved wording",
  recordedFields().find((f) => f.label === "Company")?.detail,
  "Not collected.",
);

eq(
  "the information-location body is the approved wording",
  conversationsDestination().detail,
  "Phone numbers appear under Conversations as part of the available conversation records, together with stored status and tier information when present.",
);

check(
  "the information-location body claims no historical completeness",
  !/\b(every|all|complete|entire|full history|always)\b/i.test(conversationsDestination().detail),
);

eq(
  "the detail heading is the approved wording",
  detailCopy().title,
  "No contact record is available",
);

eq(
  "the detail body is the approved wording",
  detailCopy().detail,
  "This SMS Receptionist does not store separate contact records, so this route cannot load a contact. Nothing was looked up.",
);

check(
  "the page renders the approved section heading",
  pageCode.includes("What is stored with a conversation"),
);

check(
  "the stored/not-stored distinction reaches assistive technology",
  pageCode.includes('" — stored"') && pageCode.includes('" — not stored"'),
);

check(
  "the availability copy states the fact without promising a release",
  !/coming soon|soon|shortly|on the way|next release|roadmap/i.test(
    `${availabilityCopy().title} ${availabilityCopy().detail}`,
  ),
);

eq("exactly one identity field is genuinely recorded", recordedCount(), 1);

eq(
  "the recorded field is the phone number",
  recordedFields().filter((f) => f.recorded).map((f) => f.label),
  ["Phone number"],
);

eq(
  "name, email and company are all reported as not recorded",
  recordedFields().filter((f) => !f.recorded).map((f) => f.label),
  ["Name", "Email address", "Company"],
);

check(
  "recordedCount is derived from the list, not hardcoded",
  recordedCount([
    { label: "A", recorded: true, detail: "" },
    { label: "B", recorded: true, detail: "" },
    { label: "C", recorded: false, detail: "" },
  ]) === 2,
);

eq(
  "the conversations link is base-relative, matching every other in-app link",
  conversationsDestination().href,
  "/conversations",
);

eq(
  "the link describes its actual action",
  conversationsDestination().label,
  "View conversations",
);

check(
  "the detail copy says nothing was looked up",
  /nothing was looked up/i.test(detailCopy().detail) && detailCopy().title.length > 0,
);

// ─── Navigation contract preserved ─────────────────────────────────────────

section("Navigation contract — unchanged from the protected baseline");

check(
  "route paths are unchanged",
  routesSrc.includes('contacts: "/contacts"') &&
    routesSrc.includes('contactDetail: "/contacts/:id"'),
);

check(
  "both routes are still registered, list before detail",
  appSrc.indexOf("ROUTES.contacts}") > 0 &&
    appSrc.indexOf("ROUTES.contacts}") < appSrc.indexOf("ROUTES.contactDetail}"),
);

check(
  "the routes remain inside DashboardShell, so the session gate still applies",
  appSrc.indexOf("<DashboardShell>") < appSrc.indexOf("ROUTES.contacts}") &&
    appSrc.indexOf("ROUTES.contacts}") < appSrc.indexOf("</DashboardShell>"),
);

check(
  "the nav entry is untouched — still live, still ungated, still /contacts",
  navSrc.includes(
    '{ key: "contacts", label: "Contacts", href: "/contacts", icon: Contact, state: "live", voiceGated: false }',
  ),
);

check(
  "both pages are still lazy-imported at their own call site",
  appSrc.includes('const Contacts = lazy(() => import("@/pages/Contacts"))') &&
    appSrc.includes('const ContactDetail = lazy(() => import("@/pages/ContactDetail"))'),
);

check(
  "no hardcoded base path — links stay base-relative for the configured prefix",
  !/\/ai-receptionist\/dashboard/.test(bothPages),
);

// ─── Accessibility ─────────────────────────────────────────────────────────

section("Accessibility");

check(
  "each page has exactly one h1",
  (pageCode.match(/<h1/g) ?? []).length === 1 && (detailCode.match(/<h1/g) ?? []).length === 1,
);

check(
  "no heading level is skipped — h1 then h2, never h3 first",
  !/<h3/.test(bothPages),
);

check(
  "every section is labelled by its own heading",
  (pageCode.match(/aria-labelledby=/g) ?? []).length ===
    (pageCode.match(/<section/g) ?? []).length,
);

check(
  "the recorded/not-recorded distinction is carried by text, not colour alone",
  pageCode.includes("recorded") && pageCode.includes("sd-sr"),
);

check(
  "the field list uses real description-list semantics",
  /<dl/.test(pageCode) && /<dt/.test(pageCode) && /<dd/.test(pageCode),
);

check(
  "navigation uses real links, not clickable divs",
  /<Link/.test(bothPages) && !/<div[^>]*onClick/.test(bothPages),
);

check(
  "no clickable generic element and no positive tabIndex",
  !/onClick/.test(bothPages) && !/tabIndex=\{[1-9]/.test(bothPages),
);

check(
  "decorative icons and marks are hidden from assistive technology",
  (bothPages.match(/<ArrowRight|<ArrowLeft|sk-fields__mark/g) ?? []).length <=
    (bothPages.match(/aria-hidden="true"/g) ?? []).length,
);

check(
  "the list is not announced as a live region",
  !/aria-live|role="status"|role="alert"/.test(bothPages),
);

// ─── Visual system ─────────────────────────────────────────────────────────

section("Visual system — inherited, not re-invented");

check(
  "the stylesheet defines no colour of its own — every value is an --sd-* token",
  !/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(cssCode),
);

check(
  "no purple, indigo or ordinary green is introduced",
  !/purple|indigo|violet|#7c3aed|#4f46e5|green/i.test(cssCode),
);

check(
  "no gradient, glass or glow",
  !/gradient|backdrop-filter|box-shadow:[^;]*rgba?\([^)]*0\.[3-9]/i.test(cssCode),
);

check(
  "no image, video or generated asset is referenced",
  !/url\(/.test(cssCode) && !/<img|<video/.test(bothPages),
);

check(
  "the shell stylesheet is imported alongside, not replaced",
  pageSrc.includes('import "@/styles/v2-dashboard.css"') &&
    pageSrc.includes('import "@/styles/v2-contacts.css"') &&
    detailSrc.includes('import "@/styles/v2-dashboard.css"'),
);

check(
  "the workspace is styled by its own namespace and does not redefine sd-* classes",
  !/^\.sd-[a-z-]+\s*\{/m.test(cssCode),
);

check(
  "not every section became a card",
  (cssCode.match(/border-radius: var\(--sd-radius-card\)/g) ?? []).length <= 2,
);

check(
  "no pill or badge was invented to carry a status that does not exist",
  !/sk-pill|sk-badge|sd-chip/.test(bothPages),
);

// ─── Motion ────────────────────────────────────────────────────────────────

section("Motion");

check(
  "the layer adds no keyframes of its own",
  !/@keyframes/.test(cssCode),
);

check(
  "no continuous or infinite animation",
  !/infinite|animation-iteration-count:\s*(?!1\b)/.test(cssCode),
);

check(
  "the shared single entrance is used, and nothing is staggered",
  bothPages.includes("sd-enter") && !/animation-delay|stagger|transitionDelay/.test(
    `${cssCode}\n${bothPages}`,
  ),
);

check(
  "transitions are limited to colour properties — no layout animation",
  !/transition:\s*(all|width|height|top|left|margin|padding)/.test(cssCode),
);

// ─── Result ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All Phase 10 contacts contract tests passed.");
