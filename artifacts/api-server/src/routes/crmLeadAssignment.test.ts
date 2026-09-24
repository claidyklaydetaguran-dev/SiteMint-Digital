/**
 * M6 — a contact's owner becomes a staff reference.
 *
 * What this file exists to prove, hardest first:
 *
 *   1. **The SQL backfill and the TypeScript rules agree.** The same fixtures go
 *      through docs/crm-ops/schema/M6-lead-assignee.sql and through
 *      backfillLeadAssignees(). Every contact's resolved owner and every
 *      recorded decision must be identical — and must equal a table of answers
 *      written out by hand here, so the two cannot be wrong together.
 *   2. **Nothing is guessed.** First names, initials, substrings, a trailing
 *      non-breaking space, a doubled inner space and a non-ASCII case variant
 *      all resolve to nobody; an ambiguous name resolves to nobody; a decision
 *      a person made is never undone by running either backfill again.
 *   3. **The unresolved list is honest,** and the mapping action records who
 *      decided, when, and by which rule or by hand — and refuses anybody who
 *      may not, without writing.
 *   4. **Every owner write keeps the two columns together:** the picker, a
 *      free-text name, a merge, and an import — which also reports the names it
 *      could not resolve, and whose plan hash moves when a resolution does.
 *
 * The pure rules are tested unconditionally. Everything touching a database is
 * gated on CRM_TEST_DATABASE_URL and skipped without it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { and, eq, inArray, like, or } from "drizzle-orm";
import {
  explainOwnerMatch, matchOwner, ownerKey, trimOwnerValue, OWNER_MATCH_RULES,
  type OwnerCandidate,
} from "../lib/leadOwnerRules.js";

// Nothing in this suite may reach a provider.
vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => false,
  staffMailBlockedReason: () => "RESEND_API_KEY is not set in this test run.",
  trySendStaffMail: async () => ({
    sent: false as const, failure: "not_configured" as const, configured: false,
    reason: "RESEND_API_KEY is not set in this test run.",
  }),
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
}));

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "lead-assignment-admin-secret-value";
delete process.env.CRM_EMAIL_TEST_MODE;

// ── 1. The rules, with no database ──────────────────────────────────────────

function person(id: number, displayName: string, over: Partial<OwnerCandidate> = {}): OwnerCandidate {
  return { id, displayName, email: `p${id}@example.test`, status: "active", legacyNames: [], ...over };
}

describe("the lead-owner matching rules", () => {
  it("builds the key from edge ASCII whitespace and A-Z folding, and nothing else", () => {
    expect(ownerKey("  Saisa Lorraigne\t\r\n")).toBe("saisa lorraigne");
    expect(ownerKey("SAISA  LORRAIGNE")).toBe("saisa  lorraigne");
    expect(ownerKey("José")).toBe("josé");
    // Non-ASCII case is compared exactly: the SQL side uses translate() over
    // A-Z, which means the same thing on every database locale.
    expect(ownerKey("JOSÉ")).toBe("josÉ");
    // A non-breaking space is not one of the four trimmed characters.
    expect(ownerKey("Sam ")).toBe("sam ");
    expect(ownerKey(null)).toBe("");
    expect(ownerKey(42)).toBe("");
    expect(trimOwnerValue("\t Sam Rivera \n")).toBe("Sam Rivera");
  });

  it("tries display name, then legacy names, then email — and the first rule that matches decides", () => {
    const staff = [
      person(1, "Casey Stone"),
      person(2, "Pat Quinn", { legacyNames: ["Casey Stone"] }),
      person(3, "Robin Hale", { legacyNames: ["robin@alt.test"] }),
      person(4, "Drew Fox", { email: "robin@alt.test" }),
      person(5, "Kim Lee", { email: "kim@example.test" }),
    ];
    expect(OWNER_MATCH_RULES).toEqual(["display_name", "legacy_name", "email"]);
    expect(matchOwner("casey stone", staff)).toEqual({ outcome: "matched", staffId: 1, rule: "display_name" });
    expect(matchOwner("ROBIN@ALT.TEST", staff)).toEqual({ outcome: "matched", staffId: 3, rule: "legacy_name" });
    expect(matchOwner(" kim@example.test ", staff)).toEqual({ outcome: "matched", staffId: 5, rule: "email" });
  });

  it("resolves a tie at the deciding rule to nobody, and names who it could be", () => {
    const staff = [
      person(1, "Alex Morgan"),
      person(2, "Alex Morgan", { status: "disabled" }),
      person(3, "Jo Park", { legacyNames: ["JP"] }),
      person(4, "Joan Park", { legacyNames: ["jp"] }),
    ];
    const alex = matchOwner("alex morgan", staff);
    expect(alex).toMatchObject({ outcome: "ambiguous", rule: "display_name" });
    expect(alex.outcome === "ambiguous" ? alex.candidates.map((c) => c.id) : []).toEqual([1, 2]);
    expect(matchOwner("Jp", staff)).toMatchObject({ outcome: "ambiguous", rule: "legacy_name" });

    // Two people with one display name are told apart by email, and a disabled
    // account says so.
    const said = explainOwnerMatch("Alex Morgan", alex, staff);
    expect(said).toContain("p1@example.test");
    expect(said).toContain("p2@example.test");
    expect(said).toContain("disabled");
  });

  it("never guesses: no first names, initials, substrings or near misses", () => {
    const staff = [person(1, "Sam Rivera", { legacyNames: ["Sammy R"] })];
    for (const value of ["Sam", "S. Rivera", "Rivera", "Sam Rivera ", "Sam  Rivera", "Sammy", "Sam Rivera Jr", "", "   "]) {
      expect(matchOwner(value, staff), JSON.stringify(value)).toEqual({ outcome: "none" });
    }
  });

  it("counts one person once, and matches disabled and invited accounts", () => {
    const staff = [
      person(1, "Morgan Vale", { status: "disabled", legacyNames: ["Morgan Vale", "morgan vale"] }),
      person(2, "Lee Invite", { status: "invited" }),
    ];
    expect(matchOwner("Morgan Vale", staff)).toEqual({ outcome: "matched", staffId: 1, rule: "display_name" });
    expect(matchOwner("lee invite", [...staff, staff[1]])).toEqual({ outcome: "matched", staffId: 2, rule: "display_name" });
  });
});

// ── 2. Against a real database ──────────────────────────────────────────────

const suite = TEST_DB ? describe : describe.skip;

const STAMP = Date.now();
const S = ` ${STAMP}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../../..");
const SQL_FILE = path.join(REPO_ROOT, "docs/crm-ops/schema/M6-lead-assignee.sql");

const OWNER = { email: `assign-owner-${STAMP}@example.test`, name: `[CRM-TEST] Assign Owner${S}`, password: "lodestar-quarry-7731" };
const OPS = { email: `assign-ops-${STAMP}@example.test`, name: `[CRM-TEST] Assign Ops${S}`, password: "saltmarsh-beacon-4419" };

/** People the rules resolve names TO. None of them signs in. */
const PEOPLE = {
  sam:     { displayName: `Sam Rivera${S}`, legacyNames: [`Sammy R${S}`] },
  alexA:   { displayName: `Alex Morgan${S}` },
  alexB:   { displayName: `Alex Morgan${S}`, status: "disabled" },
  jo:      { displayName: `Jo Park${S}`, legacyNames: [`JP${S}`] },
  joan:    { displayName: `Joan Park${S}`, legacyNames: [`jp${S}`] },
  kim:     { displayName: `Kim Lee${S}`, email: `kim-${STAMP}@example.test` },
  pat:     { displayName: `Pat Quinn${S}`, legacyNames: [`Casey Stone${S}`] },
  casey:   { displayName: `Casey Stone${S}` },
  robin:   { displayName: `Robin Hale${S}`, legacyNames: [`robin-alt-${STAMP}@example.test`] },
  drew:    { displayName: `Drew Fox${S}`, email: `robin-alt-${STAMP}@example.test` },
  gone:    { displayName: `Morgan Vale${S}`, status: "disabled" },
  invited: { displayName: `Lee Invite${S}`, status: "invited" },
  jose:    { displayName: `José Núñez${S}` },
} satisfies Record<string, { displayName: string; legacyNames?: string[]; status?: string; email?: string }>;
type PersonKey = keyof typeof PEOPLE;

/**
 * The hand-written answer table. `preset` is an owner a person already decided
 * before the backfill ran; `expect` is who the contact must belong to after it.
 */
const FIXTURES: Array<{ tag: string; value: string | null; preset?: PersonKey; expect: PersonKey | null }> = [
  { tag: "display",         value: `Sam Rivera${S}`,                  expect: "sam" },
  { tag: "display-spacing", value: `  sam rivera${S}\t`,              expect: "sam" },
  { tag: "legacy",          value: `SAMMY R${S}`,                     expect: "sam" },
  { tag: "ambiguous-name",  value: `Alex Morgan${S}`,                 expect: null },
  { tag: "ambiguous-legacy",value: `JP${S}`,                          expect: null },
  { tag: "email",           value: `KIM-${STAMP}@EXAMPLE.TEST`,       expect: "kim" },
  { tag: "rule-1-over-2",   value: `Casey Stone${S}`,                 expect: "casey" },
  { tag: "rule-2-over-3",   value: `robin-alt-${STAMP}@example.test`, expect: "robin" },
  { tag: "disabled",        value: `Morgan Vale${S}`,                 expect: "gone" },
  { tag: "invited",         value: `Lee Invite${S}`,                  expect: "invited" },
  { tag: "non-ascii-case",  value: `JOSÉ NÚÑEZ${S}`,                  expect: null },
  { tag: "non-ascii-exact", value: `José Núñez${S}`,                  expect: "jose" },
  { tag: "first-name",      value: `Sam${S}`,                         expect: null },
  { tag: "initial",         value: `S. Rivera${S}`,                   expect: null },
  { tag: "substring",       value: `Rivera${S}`,                      expect: null },
  { tag: "nbsp",            value: `Sam Rivera${S} `,            expect: null },
  { tag: "double-space",    value: `Sam  Rivera${S}`,                 expect: null },
  { tag: "empty",           value: "",                                expect: null },
  { tag: "blank",           value: "   ",                             expect: null },
  { tag: "no-owner",        value: null,                              expect: null },
  { tag: "decided-by-hand", value: `Sam Rivera${S}`, preset: "kim",   expect: "kim" },
];

/** The decisions the backfill must record for those fixtures, rule by rule. */
const EXPECTED_DECISIONS: Array<{ value: string; who: PersonKey; rule: string; leads: number; spellings: string[] }> = [
  { value: `Sam Rivera${S}`, who: "sam", rule: "display_name", leads: 2, spellings: [`Sam Rivera${S}`, `sam rivera${S}`] },
  { value: `SAMMY R${S}`, who: "sam", rule: "legacy_name", leads: 1, spellings: [`SAMMY R${S}`] },
  { value: `KIM-${STAMP}@EXAMPLE.TEST`, who: "kim", rule: "email", leads: 1, spellings: [`KIM-${STAMP}@EXAMPLE.TEST`] },
  { value: `Casey Stone${S}`, who: "casey", rule: "display_name", leads: 1, spellings: [`Casey Stone${S}`] },
  { value: `robin-alt-${STAMP}@example.test`, who: "robin", rule: "legacy_name", leads: 1, spellings: [`robin-alt-${STAMP}@example.test`] },
  { value: `Morgan Vale${S}`, who: "gone", rule: "display_name", leads: 1, spellings: [`Morgan Vale${S}`] },
  { value: `Lee Invite${S}`, who: "invited", rule: "display_name", leads: 1, spellings: [`Lee Invite${S}`] },
  { value: `José Núñez${S}`, who: "jose", rule: "display_name", leads: 1, spellings: [`José Núñez${S}`] },
];

class Agent {
  cookie = ""; csrf = "";
  constructor(private baseUrl: () => string) {}

  async call(method: string, p: string, body?: unknown) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers["Cookie"] = this.cookie;
    if (this.csrf) headers["x-csrf-token"] = this.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl()}${p}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    return { status: res.status, json, text };
  }

  async login(who: { email: string; password: string }) {
    const res = await fetch(`${this.baseUrl()}/api/crm/staff/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who.email, password: who.password }),
    });
    this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const data = await res.json().catch(() => ({})) as { csrfToken?: string };
    this.csrf = data.csrfToken ?? "";
    return res.status;
  }
}

/** A pg client that runs a whole SQL file the way psql -f would. */
type SqlRunner = { connect(): Promise<void>; query(text: string): Promise<unknown>; end(): Promise<void> };

suite("lead owners resolved to staff (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let assignee: typeof import("../lib/leadAssignee.js");

  const owner = new Agent(() => base);
  const ops = new Agent(() => base);

  const staffIds = {} as Record<PersonKey | "OWNER" | "OPS", number>;
  const leadIdByTag: Record<string, number> = {};
  const extraLeadIds = new Set<number>();
  const createdEmails = new Set<string>();

  const leadEmail = (tag: string) => {
    const email = `assign-lead-${tag}-${STAMP}@example.test`;
    createdEmails.add(email);
    return email;
  };

  async function runSqlFile(): Promise<void> {
    const requireFromDb = createRequire(path.join(REPO_ROOT, "lib/db/package.json"));
    const pg = requireFromDb("pg") as { Client: new (config: { connectionString: string }) => SqlRunner };
    const client = new pg.Client({ connectionString: String(TEST_DB) });
    await client.connect();
    try {
      await client.query(readFileSync(SQL_FILE, "utf8"));
    } finally {
      await client.end();
    }
  }

  async function makeLead(tag: string, value: string | null, preset?: PersonKey): Promise<number> {
    const [row] = await db.insert(schema.crmLeads).values({
      name: `[CRM-TEST] owner fixture ${tag}`,
      email: leadEmail(tag),
      assignedTo: value,
      assignedToStaffId: preset ? staffIds[preset] : null,
    }).returning({ id: schema.crmLeads.id });
    extraLeadIds.add(row.id);
    return row.id;
  }

  async function ownerOf(leadId: number): Promise<number | null> {
    const [row] = await db.select({ id: schema.crmLeads.assignedToStaffId })
      .from(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    return row?.id ?? null;
  }

  async function legacyNamesOf(who: PersonKey): Promise<string[]> {
    const [row] = await db.select({ names: schema.crmStaff.legacyNames })
      .from(schema.crmStaff).where(eq(schema.crmStaff.id, staffIds[who]));
    return row?.names ?? [];
  }

  async function decisionsFor(value: string) {
    return db.select().from(schema.crmLeadOwnerMappings)
      .where(eq(schema.crmLeadOwnerMappings.valueKey, ownerKey(value)));
  }

  /** Every fixture's owner and updated_at, plus every decision recorded for this run. */
  async function snapshot() {
    const ids = Object.values(leadIdByTag);
    const rows = await db.select({
      id: schema.crmLeads.id,
      staffId: schema.crmLeads.assignedToStaffId,
      updatedAt: schema.crmLeads.updatedAt,
    }).from(schema.crmLeads).where(inArray(schema.crmLeads.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const leads = Object.fromEntries(Object.entries(leadIdByTag).map(([tag, id]) => {
      const row = byId.get(id);
      return [tag, { staffId: row?.staffId ?? null, updatedAt: row?.updatedAt.toISOString() ?? null }];
    }));
    const decisions = (await db.select({
      valueKey: schema.crmLeadOwnerMappings.valueKey,
      valueLabel: schema.crmLeadOwnerMappings.valueLabel,
      staffId: schema.crmLeadOwnerMappings.staffId,
      rule: schema.crmLeadOwnerMappings.rule,
      leadsUpdated: schema.crmLeadOwnerMappings.leadsUpdated,
      legacyNameAdded: schema.crmLeadOwnerMappings.legacyNameAdded,
      decidedByStaffId: schema.crmLeadOwnerMappings.decidedByStaffId,
      decidedByLabel: schema.crmLeadOwnerMappings.decidedByLabel,
    }).from(schema.crmLeadOwnerMappings)
      .where(like(schema.crmLeadOwnerMappings.valueKey, `%${STAMP}%`)))
      .sort((a, b) => (a.valueKey < b.valueKey ? -1 : a.valueKey > b.valueKey ? 1 : a.staffId - b.staffId));
    return { leads, decisions };
  }

  /** Put every fixture back to "before any backfill". */
  async function resetFixtures(): Promise<void> {
    for (const f of FIXTURES) {
      await db.update(schema.crmLeads)
        .set({ assignedToStaffId: f.preset ? staffIds[f.preset] : null })
        .where(eq(schema.crmLeads.id, leadIdByTag[f.tag]));
    }
    await db.delete(schema.crmLeadOwnerMappings)
      .where(like(schema.crmLeadOwnerMappings.valueKey, `%${STAMP}%`));
  }

  function unresolvedByKey(json: Record<string, any>): Map<string, Record<string, any>> {
    return new Map((json["unresolved"] as Array<Record<string, any>>)
      .filter((u) => String(u["value"]).includes(String(STAMP)))
      .map((u) => [String(u["key"]), u]));
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    const { assertDisposableDatabase } = await import("../lib/disposableDatabase.js");
    await assertDisposableDatabase("the lead-assignment suite");
    assignee = await import("../lib/leadAssignee.js");

    // The suite applies the reviewed file itself — it is idempotent, and every
    // query below needs its column and table.
    await runSqlFile();

    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    for (const [key, who, role] of [["OWNER", OWNER, "owner"], ["OPS", OPS, "operations_manager"]] as const) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role, status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning({ id: schema.crmStaff.id });
      staffIds[key] = row.id;
    }
    for (const [key, p] of Object.entries(PEOPLE) as Array<[PersonKey, (typeof PEOPLE)[PersonKey]]>) {
      const spec = p as { displayName: string; legacyNames?: string[]; status?: string; email?: string };
      const [row] = await db.insert(schema.crmStaff).values({
        email: spec.email ?? `assign-${key.toLowerCase()}-${STAMP}@example.test`,
        displayName: spec.displayName,
        role: "operations_manager",
        status: spec.status ?? "active",
        legacyNames: spec.legacyNames ?? [],
      }).returning({ id: schema.crmStaff.id });
      staffIds[key] = row.id;
    }

    for (const f of FIXTURES) leadIdByTag[f.tag] = await makeLead(f.tag, f.value, f.preset);

    expect(await owner.login(OWNER)).toBe(200);
    expect(await ops.login(OPS)).toBe(200);
  }, 180_000);

  afterAll(async () => {
    if (db && schema) {
      const byEmail = createdEmails.size
        ? await db.select({ id: schema.crmLeads.id }).from(schema.crmLeads)
          .where(inArray(schema.crmLeads.email, [...createdEmails]))
        : [];
      const ids = [...new Set([...extraLeadIds, ...byEmail.map((r) => r.id)])];
      if (ids.length) {
        await db.delete(schema.crmContactMerges).where(or(
          inArray(schema.crmContactMerges.primaryLeadId, ids), inArray(schema.crmContactMerges.mergedLeadId, ids)));
        await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, ids));
        await db.delete(schema.crmTasks).where(inArray(schema.crmTasks.leadId, ids));
        await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, ids));
      }
      await db.delete(schema.crmLeadOwnerMappings)
        .where(like(schema.crmLeadOwnerMappings.valueKey, `%${STAMP}%`));
      const staff = Object.values(staffIds);
      if (staff.length) await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, staff));
    }
    if (server) await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── The backfill: SQL and TypeScript agree ────────────────────────────────

  it("the SQL file and the TypeScript backfill decide every contact identically, and as written down", async () => {
    expect(readFileSync(SQL_FILE, "utf8"), "both sides record the same decider").toContain(assignee.BACKFILL_DECIDED_BY_LABEL);

    await resetFixtures();
    const before = await snapshot();

    await runSqlFile();
    const viaSql = await snapshot();

    await resetFixtures();
    await assignee.backfillLeadAssignees();
    const viaTs = await snapshot();

    expect(viaTs.leads).toEqual(viaSql.leads);
    expect(viaTs.decisions).toEqual(viaSql.decisions);

    // ...and both equal the answers written out above, so they are not merely
    // agreeing with each other.
    for (const f of FIXTURES) {
      expect(viaSql.leads[f.tag]?.staffId, f.tag).toBe(f.expect ? staffIds[f.expect] : null);
      // A repaired reference is not an edit to the contact.
      expect(viaSql.leads[f.tag]?.updatedAt, `${f.tag} updated_at`).toBe(before.leads[f.tag]?.updatedAt);
    }
    expect(viaSql.decisions).toHaveLength(EXPECTED_DECISIONS.length);
    for (const d of EXPECTED_DECISIONS) {
      const got = viaSql.decisions.find((x) => x.valueKey === ownerKey(d.value));
      expect(got, d.value).toMatchObject({
        staffId: staffIds[d.who], rule: d.rule, leadsUpdated: d.leads,
        legacyNameAdded: false, decidedByStaffId: null, decidedByLabel: assignee.BACKFILL_DECIDED_BY_LABEL,
      });
      expect(d.spellings.map(trimOwnerValue), d.value).toContain(got?.valueLabel);
    }
  }, 120_000);

  it("running either backfill again changes nothing and records nothing", async () => {
    const settled = await snapshot();
    await runSqlFile();
    const again = await assignee.backfillLeadAssignees();
    expect(again.decisions.filter((d) => d.key.includes(String(STAMP)))).toEqual([]);
    expect(await snapshot()).toEqual(settled);
  }, 120_000);

  // ── The unresolved list ───────────────────────────────────────────────────

  it("lists each unresolved name once, with how many contacts carry it, why, and who it could be", async () => {
    await makeLead("fold-a", `Nobody Known${S}`);
    await makeLead("fold-b", `NOBODY KNOWN${S}`);

    const r = await owner.call("GET", "/api/crm/lead-assignment/unresolved");
    expect(r.status).toBe(200);
    const byKey = unresolvedByKey(r.json);

    const alex = byKey.get(ownerKey(`Alex Morgan${S}`));
    expect(alex).toMatchObject({ reason: "ambiguous", rule: "display_name", leads: 1 });
    expect((alex?.["candidates"] as Array<{ id: number }>).map((c) => c.id).sort((a, b) => a - b))
      .toEqual([staffIds.alexA, staffIds.alexB].sort((a, b) => a - b));
    expect((alex?.["candidates"] as Array<{ id: number; status: string }>).find((c) => c.id === staffIds.alexB)?.status)
      .toBe("disabled");
    expect(String(alex?.["explanation"])).toContain("nobody was assumed");
    expect(byKey.get(ownerKey(`JP${S}`))).toMatchObject({ reason: "ambiguous", rule: "legacy_name", leads: 1 });

    for (const value of [`JOSÉ NÚÑEZ${S}`, `Sam${S}`, `S. Rivera${S}`, `Rivera${S}`, `Sam Rivera${S} `, `Sam  Rivera${S}`]) {
      expect(byKey.get(ownerKey(value)), JSON.stringify(value)).toMatchObject({ reason: "no_match", leads: 1, candidates: [] });
    }
    // Two spellings of one name are one decision, counted together.
    expect(byKey.get(ownerKey(`Nobody Known${S}`))).toMatchObject({ reason: "no_match", leads: 2 });

    // What resolved is not listed, and neither is a contact a person decided.
    for (const value of [`Sam Rivera${S}`, `Sammy R${S}`, `Kim Lee${S}`, `Casey Stone${S}`, `Morgan Vale${S}`]) {
      expect(byKey.has(ownerKey(value)), value).toBe(false);
    }

    expect(r.json["canMap"]).toBe(true);
    expect((r.json["staff"] as Array<{ id: number; status: string }>)
      .some((s) => s.id === staffIds.alexB && s.status === "disabled")).toBe(true);
    expect((r.json["recentMappings"] as Array<Record<string, unknown>>).some((m) =>
      String(m["value"]).includes(String(STAMP)) && m["rule"] === "display_name"
      && m["decidedBy"] === assignee.BACKFILL_DECIDED_BY_LABEL)).toBe(true);

    // Somebody who may read contacts sees the list — but not the staff
    // directory, and is told they cannot map.
    const asOps = await ops.call("GET", "/api/crm/lead-assignment/unresolved");
    expect(asOps.status).toBe(200);
    expect(asOps.json["canMap"]).toBe(false);
    expect(asOps.json["staff"]).toEqual([]);
    expect(unresolvedByKey(asOps.json).has(ownerKey(`Alex Morgan${S}`))).toBe(true);
  }, 60_000);

  // ── The mapping action ────────────────────────────────────────────────────

  it("refuses a mapping from somebody who may not make it, and writes nothing", async () => {
    const denied = await ops.call("POST", "/api/crm/lead-assignment/map", { value: `Sam${S}`, staffId: staffIds.sam });
    expect(denied.status).toBe(403);

    const anonymous = await new Agent(() => base).call("POST", "/api/crm/lead-assignment/map", {
      value: `Sam${S}`, staffId: staffIds.sam,
    });
    expect(anonymous.status).toBe(401);

    expect(await ownerOf(leadIdByTag["first-name"])).toBeNull();
    expect(await legacyNamesOf("sam")).toEqual([`Sammy R${S}`]);
    expect(await decisionsFor(`Sam${S}`)).toHaveLength(0);
  });

  it("maps a name that matched nobody: its contacts follow, the name is recorded on the person, and the decision says who made it", async () => {
    const startedAt = Date.now();
    const r = await owner.call("POST", "/api/crm/lead-assignment/map", { value: `  Sam${S} `, staffId: staffIds.sam });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({
      value: `Sam${S}`, rule: "manual", leadsUpdated: 1, legacyNameAdded: true,
      staff: { id: staffIds.sam }, future: { outcome: "resolves_to_them" },
    });

    expect(await ownerOf(leadIdByTag["first-name"])).toBe(staffIds.sam);
    expect(await legacyNamesOf("sam")).toEqual([`Sammy R${S}`, `Sam${S}`]);

    const [decision] = await decisionsFor(`Sam${S}`);
    expect(decision).toMatchObject({
      staffId: staffIds.sam, rule: "manual", leadsUpdated: 1, legacyNameAdded: true,
      decidedByStaffId: staffIds.OWNER, decidedByLabel: OWNER.name, valueLabel: `Sam${S}`,
    });
    expect(decision.createdAt.getTime()).toBeGreaterThanOrEqual(startedAt - 60_000);

    const audit = await db.select().from(schema.crmAdminAuditLog).where(and(
      eq(schema.crmAdminAuditLog.action, "lead.owner.mapped"),
      like(schema.crmAdminAuditLog.target, `%Sam${S}%`),
    ));
    expect(audit).toHaveLength(1);
    expect(String(audit[0].actor)).toContain(`staff:${staffIds.OWNER}`);

    const list = await owner.call("GET", "/api/crm/lead-assignment/unresolved");
    expect(unresolvedByKey(list.json).has(ownerKey(`Sam${S}`))).toBe(false);

    // Decided once: the same name, in another spelling, now resolves by itself.
    const created = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] resolves by itself", email: leadEmail("resolves"), assignedTo: `sam${S}`,
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    extraLeadIds.add(created.json["lead"].id);
    expect(created.json["lead"]).toMatchObject({ assignedTo: `sam${S}`, assignedToStaffId: staffIds.sam });
  }, 60_000);

  it("maps an ambiguous name for the contacts listed without recording it on anybody — and a re-run never undoes it", async () => {
    const r = await owner.call("POST", "/api/crm/lead-assignment/map", { value: `Alex Morgan${S}`, staffId: staffIds.alexB });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ rule: "manual", leadsUpdated: 1, legacyNameAdded: false, future: { outcome: "still_ambiguous" } });
    expect(await ownerOf(leadIdByTag["ambiguous-name"])).toBe(staffIds.alexB);
    expect(await legacyNamesOf("alexA")).toEqual([]);
    expect(await legacyNamesOf("alexB")).toEqual([]);

    // Nothing is left to map: a second decision is refused, not silently made.
    const again = await owner.call("POST", "/api/crm/lead-assignment/map", { value: `Alex Morgan${S}`, staffId: staffIds.alexA });
    expect(again.status).toBe(409);
    expect(await decisionsFor(`Alex Morgan${S}`)).toHaveLength(1);

    await runSqlFile();
    await assignee.backfillLeadAssignees();
    expect(await ownerOf(leadIdByTag["ambiguous-name"])).toBe(staffIds.alexB);
  }, 60_000);

  it("records the rule when a person confirms a match that was not applied yet", async () => {
    // A contact recorded under a name after the backfill ran, by a path that
    // did not resolve it — the panel must not pretend it matches nobody.
    const leadId = await makeLead("pending", `Kim Lee${S}`);
    const list = await owner.call("GET", "/api/crm/lead-assignment/unresolved");
    const pending = unresolvedByKey(list.json).get(ownerKey(`Kim Lee${S}`));
    expect(pending).toMatchObject({ reason: "matched_not_applied", rule: "display_name", leads: 1 });
    expect((pending?.["candidates"] as Array<{ id: number }>).map((c) => c.id)).toEqual([staffIds.kim]);

    const r = await owner.call("POST", "/api/crm/lead-assignment/map", { value: `Kim Lee${S}`, staffId: staffIds.kim });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ rule: "display_name", leadsUpdated: 1, legacyNameAdded: false });
    expect(await ownerOf(leadId)).toBe(staffIds.kim);
    const [decision] = await decisionsFor(`Kim Lee${S}`);
    expect(decision).toMatchObject({ rule: "display_name", decidedByStaffId: staffIds.OWNER });
  }, 60_000);

  it("refuses a mapping it cannot make, and says why", async () => {
    expect((await owner.call("POST", "/api/crm/lead-assignment/map", { value: " \t ", staffId: staffIds.sam })).status).toBe(400);
    expect((await owner.call("POST", "/api/crm/lead-assignment/map", { value: `Nobody Known${S}`, staffId: "someone" })).status).toBe(400);
    const missing = await owner.call("POST", "/api/crm/lead-assignment/map", { value: `Nobody Known${S}`, staffId: 2_147_483_000 });
    expect(missing.status).toBe(404);
    expect(await decisionsFor(`Nobody Known${S}`)).toHaveLength(0);
  });

  // ── Every owner write keeps both columns together ─────────────────────────

  it("the picker writes both columns from the staff row, and refuses new work for somebody who cannot sign in", async () => {
    const created = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] picked", email: leadEmail("picked"), assignedToStaffId: staffIds.sam,
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const leadId = created.json["lead"].id as number;
    extraLeadIds.add(leadId);
    expect(created.json["lead"]).toMatchObject({ assignedToStaffId: staffIds.sam, assignedTo: PEOPLE.sam.displayName });

    for (const staffId of [staffIds.alexB, staffIds.invited, 2_147_483_000]) {
      const refused = await owner.call("PATCH", `/api/crm/leads/${leadId}`, { assignedToStaffId: staffId });
      expect(refused.status, String(staffId)).toBe(400);
    }
    expect(await ownerOf(leadId)).toBe(staffIds.sam);
  });

  it("saves a contact owned by somebody who has left without re-deciding its owner", async () => {
    const leadId = await makeLead("left", `Morgan Vale${S}`, "gone");
    const r = await owner.call("PATCH", `/api/crm/leads/${leadId}`, { status: "Qualified", assignedToStaffId: staffIds.gone });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json["lead"]).toMatchObject({ status: "Qualified", assignedToStaffId: staffIds.gone, assignedTo: `Morgan Vale${S}` });
  });

  it("a new name never leaves the previous owner's id behind, and an unchanged name is not re-decided", async () => {
    const leadId = await makeLead("rename", `Alex Morgan${S}`, "alexA");

    // A person decided this ambiguous name means alexA. An older screen that
    // sends the same name back while saving something else must not undo it.
    const same = await owner.call("PATCH", `/api/crm/leads/${leadId}`, { assignedTo: `Alex Morgan${S}`, priority: "High" });
    expect(same.status, JSON.stringify(same.json)).toBe(200);
    expect(same.json["lead"]).toMatchObject({ priority: "High", assignedToStaffId: staffIds.alexA });

    const changed = await owner.call("PATCH", `/api/crm/leads/${leadId}`, { assignedTo: `JP${S}` });
    expect(changed.json["lead"]).toMatchObject({ assignedTo: `JP${S}`, assignedToStaffId: null });

    const matched = await owner.call("PATCH", `/api/crm/leads/${leadId}`, { assignedTo: `casey stone${S}` });
    expect(matched.json["lead"]).toMatchObject({ assignedToStaffId: staffIds.casey });

    const cleared = await owner.call("PATCH", `/api/crm/leads/${leadId}`, { assignedToStaffId: null });
    expect(cleared.json["lead"]).toMatchObject({ assignedTo: null, assignedToStaffId: null });
  });

  it("a merge carries the duplicate's owner reference along with its name", async () => {
    const primary = await makeLead("merge-primary", null);
    const duplicate = await makeLead("merge-duplicate", `Alex Morgan${S}`, "alexA");
    const r = await owner.call("POST", "/api/crm/contacts/duplicates/merge", { primaryId: primary, duplicateId: duplicate });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json["survivor"]).toMatchObject({ assignedTo: `Alex Morgan${S}`, assignedToStaffId: staffIds.alexA });
  }, 60_000);

  it("an import resolves owner names through the same rules and reports the ones it could not", async () => {
    const csv = [
      "name,email,owner",
      `Import One [CRM-TEST],${leadEmail("import-1")},Kim Lee${S}`,
      `Import Two [CRM-TEST],${leadEmail("import-2")},JP${S}`,
      `Import Three [CRM-TEST],${leadEmail("import-3")},Import Nobody${S}`,
      `Import Four [CRM-TEST],${leadEmail("import-4")},IMPORT NOBODY${S}`,
    ].join("\n");

    const preview = await owner.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(preview.status, JSON.stringify(preview.json)).toBe(200);
    expect(preview.json["mapping"]["assignedTo"]).toBe("owner");
    expect(preview.json["canMapOwners"]).toBe(true);

    const owners = new Map((preview.json["owners"] as Array<Record<string, any>>).map((o) => [String(o["key"]), o]));
    expect(owners.get(ownerKey(`Kim Lee${S}`))).toMatchObject({ outcome: "matched", staffId: staffIds.kim, rule: "display_name", rows: 1 });
    expect(owners.get(ownerKey(`JP${S}`))).toMatchObject({ outcome: "ambiguous", staffId: null, rows: 1 });
    expect(owners.get(ownerKey(`Import Nobody${S}`))).toMatchObject({ outcome: "none", staffId: null, rows: 2 });

    const rows = preview.json["rows"] as Array<Record<string, any>>;
    expect(rows[0]["values"]["assignedToStaffId"]).toBe(staffIds.kim);
    expect(rows[1]["values"]["assignedToStaffId"]).toBeNull();
    expect((rows[1]["notices"] as string[]).join(" ")).toContain("Unmapped lead owners");
    expect((rows[0]["notices"] as string[]).join(" ")).not.toContain("Unmapped lead owners");

    const opsPreview = await ops.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(opsPreview.status).toBe(200);
    expect(opsPreview.json["canMapOwners"]).toBe(false);

    const commit = await owner.call("POST", "/api/crm/contacts/import/commit", { csv, planHash: preview.json["planHash"] });
    expect(commit.status, JSON.stringify(commit.json)).toBe(200);
    expect(commit.json["created"]).toBe(4);

    const made = await db.select({
      email: schema.crmLeads.email, assignedTo: schema.crmLeads.assignedTo, staffId: schema.crmLeads.assignedToStaffId,
    }).from(schema.crmLeads).where(inArray(schema.crmLeads.email, [1, 2, 3, 4].map((n) => leadEmail(`import-${n}`))));
    const byEmail = new Map(made.map((m) => [m.email, m]));
    expect(byEmail.get(leadEmail("import-1"))).toMatchObject({ assignedTo: `Kim Lee${S}`, staffId: staffIds.kim });
    expect(byEmail.get(leadEmail("import-2"))).toMatchObject({ assignedTo: `JP${S}`, staffId: null });
    expect(byEmail.get(leadEmail("import-3"))).toMatchObject({ assignedTo: `Import Nobody${S}`, staffId: null });
    expect(byEmail.get(leadEmail("import-4"))).toMatchObject({ assignedTo: `IMPORT NOBODY${S}`, staffId: null });
  }, 60_000);

  it("a decision made between preview and commit changes the plan, so the approved one is refused", async () => {
    const csv = ["name,email,owner", `Import Later [CRM-TEST],${leadEmail("import-later")},Import Later${S}`].join("\n");

    const first = await owner.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(first.status).toBe(200);
    expect((first.json["owners"] as Array<Record<string, any>>)[0]).toMatchObject({ outcome: "none" });

    // Mapped from the import screen before any contact carries the name: no
    // contact moves, and the name is recorded so the file resolves.
    const mapped = await owner.call("POST", "/api/crm/lead-assignment/map", { value: `Import Later${S}`, staffId: staffIds.jo });
    expect(mapped.status, JSON.stringify(mapped.json)).toBe(200);
    expect(mapped.json).toMatchObject({ leadsUpdated: 0, legacyNameAdded: true, rule: "manual" });

    const stale = await owner.call("POST", "/api/crm/contacts/import/commit", { csv, planHash: first.json["planHash"] });
    expect(stale.status).toBe(409);
    const none = await db.select({ id: schema.crmLeads.id }).from(schema.crmLeads)
      .where(eq(schema.crmLeads.email, leadEmail("import-later")));
    expect(none).toHaveLength(0);

    const second = await owner.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect((second.json["owners"] as Array<Record<string, any>>)[0])
      .toMatchObject({ outcome: "matched", staffId: staffIds.jo, rule: "legacy_name" });
    const commit = await owner.call("POST", "/api/crm/contacts/import/commit", { csv, planHash: second.json["planHash"] });
    expect(commit.status, JSON.stringify(commit.json)).toBe(200);
    const [lead] = await db.select({ staffId: schema.crmLeads.assignedToStaffId }).from(schema.crmLeads)
      .where(eq(schema.crmLeads.email, leadEmail("import-later")));
    expect(lead?.staffId).toBe(staffIds.jo);
  }, 60_000);
});
