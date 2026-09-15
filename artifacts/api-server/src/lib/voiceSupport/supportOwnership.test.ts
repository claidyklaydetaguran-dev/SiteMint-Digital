// Support requests belong to one business, against a real database.
//
// The property under test is ownership: a business reads, answers and closes
// its own requests, and another business's request is indistinguishable from
// one that does not exist. The operator functions are the only ones that cross
// that line, and they are reachable only through the operator gate — asserted
// here from the route source, so the two cannot drift apart.
//
// Gated on CRM_TEST_DATABASE_URL. Every row created here is removed in afterAll.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";

const suite = TEST_DB ? describe : describe.skip;
const STAMP = Date.now();

suite("support requests belong to one business (real DB)", () => {
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let service: typeof import("./supportService.js");
  let firmA = 0;
  let firmB = 0;

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    service = await import("./supportService.js");
    const rows = await db
      .insert(schema.intakeFirms)
      .values([
        { name: `[TEST] Support A ${STAMP}`, notifyEmail: `support-a-${STAMP}@example.test`, email: `support-a-${STAMP}@example.test` },
        { name: `[TEST] Support B ${STAMP}`, notifyEmail: `support-b-${STAMP}@example.test`, email: `support-b-${STAMP}@example.test` },
      ])
      .returning({ id: schema.intakeFirms.id });
    firmA = rows[0]!.id;
    firmB = rows[1]!.id;
  });

  afterAll(async () => {
    if (firmA || firmB) {
      const { inArray } = await import("drizzle-orm");
      // Requests and messages cascade with the firm.
      await db.delete(schema.intakeFirms).where(inArray(schema.intakeFirms.id, [firmA, firmB].filter(Boolean)));
    }
  });

  it("records a request with its first message and leaves it waiting on SiteMint", async () => {
    const created = await service.createSupportRequest(firmA, `support-a-${STAMP}@example.test`, {
      subject: "Calendar keeps disconnecting",
      body: "It drops about once a week.",
      category: "problem",
    });
    expect(created.request.status).toBe("open");
    expect(created.request.closedAt).toBeNull();
    expect(created.request.operatorNotifiedAt).toBeNull();
    expect(created.messages).toHaveLength(1);
    expect(created.messages[0]!.author).toBe("business");

    const readBack = await service.getSupportRequest(firmA, created.request.id);
    expect(readBack?.request.subject).toBe("Calendar keeps disconnecting");
  });

  it("hides another business's request behind the same answer as a missing one", async () => {
    const mine = await service.createSupportRequest(firmA, `support-a-${STAMP}@example.test`, {
      subject: "Private to A",
      body: "Only firm A may read this.",
      category: "question",
    });

    expect(await service.getSupportRequest(firmB, mine.request.id)).toBeUndefined();
    expect(await service.getSupportRequest(firmB, 99_999_999)).toBeUndefined();
    expect(await service.addSupportMessage(firmB, mine.request.id, "business", "let me in")).toBeUndefined();
    expect(await service.closeSupportRequest(firmB, mine.request.id)).toBeUndefined();

    // ...and firm A's request is untouched by any of that.
    const after = await service.getSupportRequest(firmA, mine.request.id);
    expect(after?.request.status).toBe("open");
    expect(after?.messages).toHaveLength(1);

    const listB = await service.listSupportRequests(firmB);
    expect(listB.some((row) => row.id === mine.request.id)).toBe(false);
  });

  it("follows the thread's state: SiteMint answers, the business reopens, closing is stamped", async () => {
    const created = await service.createSupportRequest(firmA, `support-a-${STAMP}@example.test`, {
      subject: "How do I set opening hours?",
      body: "Where are they?",
      category: "question",
    });
    const id = created.request.id;

    const answered = await service.addSupportMessage(firmA, id, "sitemint", "Availability, then Save.");
    expect(answered?.request.status).toBe("answered");
    expect(answered?.messages).toHaveLength(2);

    const closed = await service.closeSupportRequest(firmA, id);
    expect(closed?.status).toBe("closed");
    expect(closed?.closedAt).not.toBeNull();

    // Writing again reopens it, and the closing stamp goes with the state.
    const reopened = await service.addSupportMessage(firmA, id, "business", "One more thing.");
    expect(reopened?.request.status).toBe("open");
    expect(reopened?.request.closedAt).toBeNull();
    expect(reopened?.messages).toHaveLength(3);
  });

  it("orders the list by the most recent activity, not by when it was opened", async () => {
    const first = await service.createSupportRequest(firmA, `support-a-${STAMP}@example.test`, {
      subject: "Older request", body: "Asked first.", category: "other",
    });
    const second = await service.createSupportRequest(firmA, `support-a-${STAMP}@example.test`, {
      subject: "Newer request", body: "Asked second.", category: "other",
    });
    await service.addSupportMessage(firmA, first.request.id, "business", "Still waiting on this one.");

    const list = await service.listSupportRequests(firmA);
    const positions = [first.request.id, second.request.id].map((id) => list.findIndex((row) => row.id === id));
    expect(positions[0]).toBeLessThan(positions[1]!);
  });

  it("lets SiteMint read and answer across businesses — and only through the operator gate", async () => {
    const mine = await service.createSupportRequest(firmB, `support-b-${STAMP}@example.test`, {
      subject: "Firm B needs help", body: "Something is wrong.", category: "problem",
    });

    const operatorView = await service.readAnySupportRequest(mine.request.id);
    expect(operatorView?.request.firmId).toBe(firmB);

    const inProgress = await service.markSupportInProgress(mine.request.id);
    expect(inProgress?.status).toBe("in_progress");

    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../routes/adminSupport.ts"), "utf8");
    for (const fn of ["listAllSupportRequests", "readAnySupportRequest", "markSupportInProgress"]) {
      expect(src).toContain(fn);
    }
    // Every route in that file is gated, and the writes need the write grant.
    const routes = src.match(/router\.(get|post)\("\/admin\/[^"]*",[^\n]*/g) ?? [];
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const route of routes) expect(route).toMatch(/requireOperator\("support\.(read|write)"\)/);
    for (const route of routes.filter((r) => r.startsWith("router.post"))) {
      expect(route).toContain('requireOperator("support.write")');
    }
    // The customer-facing file never reaches across firms.
    const customerSrc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../routes/receptionistSupport.ts"), "utf8");
    expect(customerSrc).not.toMatch(/listAllSupportRequests|readAnySupportRequest|markSupportInProgress/);
  });
});
