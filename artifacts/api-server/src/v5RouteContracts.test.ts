// V5 — structural contracts that a runtime-only test cannot prove without a
// live Postgres instance (unavailable in this dev environment — see
// MIGRATION-PACKET.md). Source-level proof, in the same spirit as
// routeSecurity.ts / publicWriteGuards.test.ts's "guard placement" checks:
//   - the controlled demo seam imports NO Vapi type/URL/SDK/credential and
//     NOTHING from lib/voice/ (CLAUDE.md's confinement rule);
//   - an invite code can only ever be consumed once (the guarded UPDATE
//     shape), and a redeemed/consumed invite cannot be redeemed again;
//   - a contact detail lookup is firm-scoped at the SQL level, not just by
//     the route calling it with the right argument;
//   - each new flag-gated public route's guard is the first statement in
//     its handler, exactly like the R4-R8 gates.
//
// These are a stand-in for, not a replacement of, a live-DB integration
// pass (concurrent-redemption race, actual cross-firm 404 over HTTP) that
// the lead should run once a database is reachable — see
// MIGRATION-PACKET.md's evidence checklist.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), ".");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("controlled demo seam — no provider import", () => {
  const demoFiles = walk(join(SRC, "lib", "publicDemo"));

  it("lib/publicDemo/ contains no reference to Vapi, and never imports lib/voice/", () => {
    expect(demoFiles.length, "the demo seam files must exist").toBeGreaterThan(0);
    for (const file of demoFiles) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/vapi/i);
      expect(src, file).not.toMatch(/from\s+["'].*lib\/voice\//);
      expect(src, file).not.toMatch(/VAPI_API_KEY|VAPI_WEBHOOK/);
    }
  });

  it("routes/publicDemo.ts imports only the demo seam, never a provider or lib/voice/", () => {
    const src = read("routes/publicDemo.ts");
    expect(src).not.toMatch(/vapi/i);
    expect(src).not.toMatch(/from\s+["'].*lib\/voice\//);
    expect(src).toMatch(/publicDemo\/demoConfig\.js/);
    expect(src).toMatch(/publicDemo\/demoSessionService\.js/);
  });

  it("the production provider factory always throws — there is no live implementation to accidentally call", () => {
    const src = read("lib/publicDemo/demoSessionProvider.ts");
    const fnStart = src.indexOf("export function createProductionDemoSessionProvider");
    expect(fnStart).toBeGreaterThan(-1);
    const body = src.slice(fnStart, fnStart + 500);
    expect(body).toMatch(/throw new Error/);
    expect((body.match(/throw new Error/g) ?? []).length).toBeGreaterThanOrEqual(2); // both startDemoSession and endDemoSession
  });
});

describe("invite codes — single-use at the SQL layer", () => {
  const src = read("lib/voiceInvites/inviteService.ts");

  it("consumeInviteCode's guarded update requires redeemed_at IS NULL and an unexpired code", () => {
    const start = src.indexOf("export async function consumeInviteCode");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 900);
    expect(body).toMatch(/\.update\(voiceInvites\)/);
    expect(body).toMatch(/isNull\(voiceInvites\.redeemedAt\)/);
    expect(body).toMatch(/gt\(voiceInvites\.expiresAt/);
    // The guard is inside the WHERE of the update itself — not a separate
    // read-then-write (which would race), and not the returning clause.
    const whereAt = body.indexOf(".where(");
    const returningAt = body.indexOf(".returning(");
    expect(whereAt).toBeGreaterThan(-1);
    expect(returningAt).toBeGreaterThan(whereAt);
    expect(body.slice(whereAt, returningAt)).toMatch(/isNull\(voiceInvites\.redeemedAt\)/);
  });

  it("a code can be redeemed only through the guarded update — there is no separate unconditional redeemedAt writer", () => {
    const setRedeemedAt = [...src.matchAll(/\.set\(\{[^}]*redeemedAt:/g)];
    expect(setRedeemedAt, "exactly one place may ever set redeemedAt").toHaveLength(1);
  });
});

describe("contacts — firm-scoped at the query layer", () => {
  const src = read("lib/voiceContacts/contactsQuery.ts");

  it("getContactDetailForFirm's lookup ANDs the contact id with the caller's firmId", () => {
    const start = src.indexOf("export async function getContactDetailForFirm");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 500);
    const whereAt = body.indexOf(".where(");
    expect(whereAt).toBeGreaterThan(-1);
    const whereClause = body.slice(whereAt, whereAt + 200);
    expect(whereClause).toMatch(/eq\(voiceContacts\.id, contactId\)/);
    expect(whereClause).toMatch(/eq\(voiceContacts\.firmId, firmId\)/);
    expect(whereClause).toMatch(/^\.where\(and\(/); // both conditions are ANDed, not OR'd
  });

  it("listContactsForFirm's base filter always includes the caller's firmId", () => {
    const start = src.indexOf("export async function listContactsForFirm");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 1200);
    expect(body).toMatch(/whereClauses\s*=\s*\[eq\(voiceContacts\.firmId, firmId\)\]/);
  });

  it("routes/receptionistContacts.ts never accepts a firmId from the request — only from the session", () => {
    const routeSrc = read("routes/receptionistContacts.ts");
    expect(routeSrc).not.toMatch(/req\.(query|params|body)\.firmId/);
    expect(routeSrc).not.toMatch(/req\.(query|params|body)\["firmId"\]/);
    expect((routeSrc.match(/req\.firmId!/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("guard placement — the three new flag-gated public routes", () => {
  const CASES: Array<{ file: string; handler: string; flag: string; forbidden: RegExp[] }> = [
    {
      file: "routes/receptionistInvites.ts",
      handler: 'router.post("/receptionist/auth/invite-signup"',
      flag: "isInviteSignupEnabled",
      forbidden: [/inviteSignupIpLimiter/, /consumeInviteCode\(/, /createFirmForInviteSignup\(/, /createSession\(/],
    },
    {
      file: "routes/publicBetaRequests.ts",
      handler: 'router.post("/public/beta-requests"',
      flag: "isPublicBetaRequestsEnabled",
      forbidden: [/betaRequestIpLimiter/, /isHoneypotTripped/, /createBetaRequest\(/],
    },
    {
      file: "routes/publicDemo.ts",
      handler: 'router.post("/public/demo/session"',
      flag: "isPublicDemoEnabled",
      forbidden: [/requestDemoSession\(/, /req\.cookies/],
    },
  ];

  for (const c of CASES) {
    it(`${c.file}: guard is the first statement and precedes every side effect`, () => {
      const src = read(c.file);
      const start = src.indexOf(c.handler);
      expect(start, "handler not found").toBeGreaterThan(-1);
      const guardIdx = src.indexOf(c.flag, start);
      expect(guardIdx, "guard not found in handler").toBeGreaterThan(-1);

      const guardBlock = src.slice(guardIdx, guardIdx + 260);
      expect(guardBlock).toMatch(/res\.status\(503\)/);
      expect(guardBlock).toMatch(/return;/);

      for (const f of c.forbidden) {
        const m = f.exec(src.slice(start));
        if (m && m.index !== undefined) {
          expect(start + m.index, `${f} must come after the guard`).toBeGreaterThan(guardIdx);
        }
      }
    });
  }
});
