// V7 — transfer contacts: one service, one validation path, one cap.
//
// The API carried the same resource twice: `/transfer-destinations` (older,
// no dashboard consumer) and `/transfer-contacts` (what the dashboard uses).
// Two paths meant two answers — the older one capped a business at ten
// destinations and the newer one did not cap at all, so the same business got
// a different rule depending on which URL it reached.
//
// Deleting the older path was not available: nothing in this repository calls
// it, but "no frontend uses it" is not proof that no consumer exists. So it was
// kept, marked deprecated, and rewired through the same service — and these
// tests hold that rewiring in place. The source-level cases are deliberate:
// they fail if a second normalization or insert path reappears anywhere in the
// route layer, which is the thing that actually caused the divergence.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// `@workspace/db` throws at import time without DATABASE_URL. The service only
// reaches it through a dynamic import, so a module stub is enough and no
// database is touched by any case here.
vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));
vi.mock("@workspace/db/schema/voice", () => ({ voiceTransferDestinations: { name: "voice_transfer_destinations" } }));

import {
  MAX_TRANSFER_CONTACTS,
  createTransferContact,
  validateTransferContact,
  type NormalizedContact,
} from "./transferContactService.js";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

// ── a fake drizzle surface, shaped by which chain the service actually uses ───
//
// The two reads in createTransferContact are distinguishable without guessing
// call order: the cap count is awaited straight off `.where(...)`, and the
// duplicate probe ends in `.limit(1)`. So the fake answers by chain shape, and
// a change in either query makes the test fail loudly instead of passing on a
// coincidence.
function fakeDb(options: { existingCount: number; duplicate?: boolean }) {
  const inserted: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];

  const countRows = Array.from({ length: options.existingCount }, (_, i) => ({ id: i + 1 }));
  const dupRows = options.duplicate ? [{ id: 999 }] : [];

  function selectBuilder() {
    const thenable = {
      // Awaited directly → the cap count.
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(countRows).then(resolve),
      // Ends in .limit(1) → the duplicate probe.
      limit: () => Promise.resolve(dupRows),
      orderBy: () => Promise.resolve(countRows),
    };
    return { from: () => ({ where: () => thenable }) };
  }

  const db = {
    select: () => selectBuilder(),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return { returning: () => Promise.resolve([{ id: 4242 }]) };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  };
  return { db, inserted, updates };
}

async function withDb(fake: ReturnType<typeof fakeDb>, run: () => Promise<unknown>) {
  const mod = await import("@workspace/db");
  const previous = (mod as { db: unknown }).db;
  (mod as { db: unknown }).db = fake.db;
  try {
    return await run();
  } finally {
    (mod as { db: unknown }).db = previous;
  }
}

function contact(overrides: Partial<NormalizedContact> = {}): NormalizedContact {
  const validated = validateTransferContact({
    label: "Dana Rivera",
    phone: "+14155550123",
    useBusinessHours: true,
    consentConfirmed: false,
  });
  if (!validated.ok) throw new Error("fixture is invalid: " + JSON.stringify(validated.errors));
  return { ...validated.value, ...overrides };
}

describe("transfer contacts — one cap, enforced in the service", () => {
  it("refuses a create once the business is at the cap", async () => {
    const fake = fakeDb({ existingCount: MAX_TRANSFER_CONTACTS });
    const result = (await withDb(fake, () => createTransferContact(1, contact(), "owner@example.com"))) as Awaited<
      ReturnType<typeof createTransferContact>
    >;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors[0]!.code).toBe("too_many");
    // The refusal has to happen BEFORE the write, or the cap is decoration.
    expect(fake.inserted).toHaveLength(0);
  });

  it("allows a create one below the cap", async () => {
    const fake = fakeDb({ existingCount: MAX_TRANSFER_CONTACTS - 1 });
    const result = (await withDb(fake, () => createTransferContact(1, contact(), "owner@example.com"))) as Awaited<
      ReturnType<typeof createTransferContact>
    >;
    expect(result.ok).toBe(true);
    expect(fake.inserted).toHaveLength(1);
  });

  it("still refuses a duplicate number below the cap", async () => {
    const fake = fakeDb({ existingCount: 2, duplicate: true });
    const result = (await withDb(fake, () => createTransferContact(1, contact(), "owner@example.com"))) as Awaited<
      ReturnType<typeof createTransferContact>
    >;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors[0]!.code).toBe("phone_duplicate");
    expect(fake.inserted).toHaveLength(0);
  });

  it("records consent only when the caller asserted it", async () => {
    const withConsent = fakeDb({ existingCount: 0 });
    await withDb(withConsent, () => createTransferContact(1, contact({ consentConfirmed: true }), "owner@example.com"));
    expect(withConsent.inserted[0]!.consentConfirmedAt).toBeInstanceOf(Date);
    expect(withConsent.inserted[0]!.consentConfirmedBy).toBe("owner@example.com");

    const without = fakeDb({ existingCount: 0 });
    await withDb(without, () => createTransferContact(1, contact({ consentConfirmed: false }), "owner@example.com"));
    expect(without.inserted[0]!.consentConfirmedAt).toBeNull();
    expect(without.inserted[0]!.consentConfirmedBy).toBeNull();
  });
});

describe("transfer contacts — the route layer has no second validation path", () => {
  const legacy = read("routes/receptionistNumbers.ts");
  const current = read("routes/receptionistTransferContacts.ts");

  it("both routes reach the resource through the shared service", () => {
    for (const [name, source] of [
      ["receptionistNumbers.ts", legacy],
      ["receptionistTransferContacts.ts", current],
    ] as const) {
      expect(source, name).toContain("voiceTransferContacts/transferContactService.js");
      expect(source, name).toContain("validateTransferContact");
    }
  });

  it("neither route writes the table directly", () => {
    for (const [name, source] of [
      ["receptionistNumbers.ts", legacy],
      ["receptionistTransferContacts.ts", current],
    ] as const) {
      for (const verb of ["insert", "update", "delete"] as const) {
        expect(source, `${name} must not ${verb} voiceTransferDestinations directly`).not.toMatch(
          new RegExp(`db\\s*\\.\\s*${verb}\\s*\\(\\s*voiceTransferDestinations`),
        );
      }
    }
  });

  it("the legacy route no longer normalizes phone numbers itself", () => {
    // Its own normalizer accepted inputs the shared one rejects, which is how a
    // number could exist on the list in a shape the current surface would not
    // have produced.
    expect(legacy).not.toContain("normalizePhoneE164");
  });

  it("the cap is declared exactly once in the whole server", () => {
    const declarations = [
      ...read("lib/voiceTransferContacts/transferContactService.ts").matchAll(/MAX_TRANSFER_CONTACTS\s*=/g),
      ...legacy.matchAll(/MAX_(?:TRANSFER_CONTACTS|DESTINATIONS)\s*=/g),
      ...current.matchAll(/MAX_(?:TRANSFER_CONTACTS|DESTINATIONS)\s*=/g),
    ];
    expect(declarations).toHaveLength(1);
  });

  it("every legacy handler announces its deprecation", () => {
    const handlers = [...legacy.matchAll(/router\.(get|post|patch|delete)\((\s*)"\/receptionist\/voice\/transfer-destinations/g)];
    expect(handlers).toHaveLength(4);
    // One markDeprecated per handler, and the successor is named in the header.
    expect([...legacy.matchAll(/markDeprecated\(res\)/g)]).toHaveLength(4);
    expect(legacy).toContain('rel="successor-version"');
    expect(legacy).toContain("/api/receptionist/voice/transfer-contacts");
  });
});
