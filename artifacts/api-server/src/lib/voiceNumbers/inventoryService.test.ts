// Handing a telephone number from organisation stock to one business.
//
// The two things this must never do: let a business end up holding a number
// another business already has, and report a number as live when the provider
// has not confirmed it. The second is the subtle one — `assigned` is exactly
// what the customer-facing capability reads to promise a business that
// transfers will work.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  assignNumberToFirm,
  findLocalMatch,
  readInventory,
  releaseNumber,
  type AssignDeps,
  type LocalNumberRow,
} from "./inventoryService.js";
import type { VoicePhoneNumberRecord } from "../voice/types.js";

const NUMBER: VoicePhoneNumberRecord = {
  providerNumberId: "pn_abc123",
  e164: "+15555559097",
  origin: "twilio",
  status: "active",
  orgId: "org_1",
  assignedAssistantId: null,
};

function deps(options: {
  provider?: VoicePhoneNumberRecord[] | "throws" | "absent";
  local?: LocalNumberRow[];
  assistantId?: number | null;
  confirm?: VoicePhoneNumberRecord | null | "throws" | "absent";
  route?: "throws" | "absent";
} = {}) {
  const writes: Array<{ state: string; pausedReason: string | null; assignedAssistantId: number }> = [];
  const routed: Array<string | null> = [];
  const provider = options.provider ?? [NUMBER];

  const d: AssignDeps = {
    ...(provider === "absent"
      ? {}
      : {
          listProviderNumbers: async () => {
            if (provider === "throws") throw new Error("ProviderDown");
            return provider;
          },
        }),
    readLocalNumbers: async () => options.local ?? [],
    findPublishedAssistantId: async () => (options.assistantId === undefined ? 7 : options.assistantId),
    findProviderAssistantId: async () => (options.assistantId === null ? null : "asst_pilot"),
    ...(options.route === "absent"
      ? {}
      : {
          routeNumber: async (_id, assistantId) => {
            routed.push(assistantId);
            if (options.route === "throws") throw new Error("ProviderRefused");
            return { ...NUMBER, assignedAssistantId: assistantId };
          },
        }),
    upsertAssignment: async (input) => {
      writes.push({
        state: input.state,
        pausedReason: input.pausedReason,
        assignedAssistantId: input.assignedAssistantId,
      });
    },
    ...(options.confirm === "absent"
      ? {}
      : {
          confirmProviderNumber: async (): Promise<VoicePhoneNumberRecord | null> => {
            if (options.confirm === "throws") throw new Error("ProviderDown");
            return options.confirm === undefined
              ? { ...NUMBER, assignedAssistantId: "asst_pilot" }
              : (options.confirm as VoicePhoneNumberRecord | null);
          },
        }),
  };
  return { deps: d, writes, routed };
}

const held = (over: Partial<LocalNumberRow> = {}): LocalNumberRow => ({
  id: 1,
  firmId: 2,
  phoneE164: NUMBER.e164,
  providerNumberId: NUMBER.providerNumberId,
  state: "assigned",
  pausedReason: null,
  ...over,
});

describe("reading what the organisation owns", () => {
  it("reports each number with who holds it here", async () => {
    const h = deps({ local: [held({ firmId: 4 })] });
    const result = await readInventory(h.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]).toMatchObject({ e164: "+15555559097", heldByFirmId: 4, localState: "assigned" });
  });

  it("says unreadable rather than empty when nobody can answer", async () => {
    // The distinction that matters: "owns nothing" and "cannot be asked" look
    // identical in an empty list and mean opposite things.
    for (const provider of ["throws", "absent"] as const) {
      const result = await readInventory(deps({ provider }).deps);
      expect(result.ok, provider).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unreadable");
    }
  });

  it("recognises a row recorded before a provider id existed", () => {
    const match = findLocalMatch(NUMBER, [held({ providerNumberId: null })]);
    expect(match?.id).toBe(1);
  });
});

describe("assigning a number", () => {
  it("assigns it, and only after the provider confirms it back", async () => {
    const h = deps();
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: true, state: "assigned", phoneE164: NUMBER.e164 });
    // Paused first, assigned second — never assigned in one step.
    expect(h.writes.map((w) => w.state)).toEqual(["paused", "assigned"]);
  });

  it("leaves it paused when the provider cannot confirm it", async () => {
    for (const confirm of ["throws", null, "absent"] as const) {
      const h = deps({ confirm });
      const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
      expect(result, String(confirm)).toMatchObject({ ok: true, state: "paused", pausedReason: "assignment_unconfirmed" });
      // Never written as assigned: a business must not be told transfers work.
      expect(h.writes.some((w) => w.state === "assigned"), String(confirm)).toBe(false);
    }
  });

  it("leaves it paused when the confirmation names a different number", async () => {
    const h = deps({ confirm: { ...NUMBER, e164: "+15555550000" } });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: true, state: "paused" });
  });

  it("stamps the firm's published assistant, because a live number must ring something", async () => {
    const h = deps();
    await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(h.writes.every((w) => w.assignedAssistantId === 7)).toBe(true);
  });

  it("points the number at the assistant at the provider", async () => {
    // The write that makes the telephone ring. Recording an assignment in our
    // own table routes exactly zero calls.
    const h = deps();
    await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(h.routed).toEqual(["asst_pilot"]);
  });

  it("stays paused when the provider refuses to route it", async () => {
    const h = deps({ route: "throws" });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: true, state: "paused", pausedReason: "routing_failed" });
    expect(h.writes.some((w) => w.state === "assigned")).toBe(false);
  });

  it("stays paused when routing cannot be changed at all", async () => {
    const h = deps({ route: "absent" });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: true, state: "paused", pausedReason: "assignment_unconfirmed" });
  });

  it("stays paused when the provider does not agree about where it routes", async () => {
    // Existing is not the same as routed here. Without this check, "assigned"
    // would again promise a telephone that rings somewhere else.
    const h = deps({ confirm: { ...NUMBER, assignedAssistantId: "asst_someone_else" } });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: true, state: "paused", pausedReason: "routing_unconfirmed" });
  });

  it("refuses when the business has no published assistant", async () => {
    const h = deps({ assistantId: null });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: false, reason: "no_published_assistant" });
    expect(h.writes).toEqual([]);
  });
});

describe("what assignment refuses", () => {
  it("refuses a number the organisation does not have", async () => {
    const h = deps({ provider: [] });
    const result = await assignNumberToFirm({ providerNumberId: "pn_nope", firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: false, reason: "not_in_provider_inventory" });
  });

  it("refuses a number another business already holds", async () => {
    const h = deps({ local: [held({ firmId: 2 })] });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: false, reason: "held_by_another_business" });
    expect(h.writes).toEqual([]);
  });

  it("allows a released number to be handed on", async () => {
    const h = deps({ local: [held({ firmId: 2, state: "released" })] });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: true, state: "assigned" });
  });

  it("treats the same business asking again as a retry, not a conflict", async () => {
    const h = deps({ local: [held({ firmId: 4, state: "paused" })] });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: true, state: "assigned" });
  });

  it("refuses a second number for a business that already has one", async () => {
    const other = held({ id: 9, firmId: 4, phoneE164: "+15555550001", providerNumberId: "pn_other" });
    const h = deps({ local: [other] });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: false, reason: "firm_already_assigned" });
  });

  it("will not silently take over routing the provider already has", async () => {
    const routed = { ...NUMBER, assignedAssistantId: "asst_live" };
    const h = deps({ provider: [routed] });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: false, reason: "provider_routing_exists" });
    expect(h.writes).toEqual([]);
  });

  it("takes over that routing only when it is said out loud", async () => {
    const routed = { ...NUMBER, assignedAssistantId: "asst_live" };
    // After the takeover the provider must report the NEW assistant; echoing
    // the old one back would mean the routing never actually moved.
    const h = deps({ provider: [routed], confirm: { ...NUMBER, assignedAssistantId: "asst_pilot" } });
    const result = await assignNumberToFirm(
      { providerNumberId: NUMBER.providerNumberId, firmId: 4, takeOverProviderRouting: true },
      h.deps,
    );
    expect(result).toMatchObject({ ok: true, state: "assigned" });
  });

  it("writes nothing when the inventory cannot be read", async () => {
    const h = deps({ provider: "throws" });
    const result = await assignNumberToFirm({ providerNumberId: NUMBER.providerNumberId, firmId: 4 }, h.deps);
    expect(result).toMatchObject({ ok: false, reason: "inventory_unreadable" });
    expect(h.writes).toEqual([]);
  });

  it("rejects a malformed request before reading anything", async () => {
    for (const bad of [{ providerNumberId: "", firmId: 4 }, { providerNumberId: "pn_a", firmId: 0 }]) {
      const result = await assignNumberToFirm(bad, deps().deps);
      expect(result, JSON.stringify(bad)).toMatchObject({ ok: false, reason: "shape_rejected" });
    }
  });
});

describe("giving a number back", () => {
  it("stops the provider routing it before releasing it locally", async () => {
    // The order is the point. A number released locally while still pointed at
    // the assistant keeps delivering that business's calls to a business that
    // gave it up.
    const order: string[] = [];
    const result = await releaseNumber(4, NUMBER.providerNumberId, {
      routeNumber: async (_id, assistantId) => {
        order.push("route:" + String(assistantId));
        return NUMBER;
      },
      releaseLocal: async () => { order.push("releaseLocal"); return true; },
    });
    expect(order).toEqual(["route:null", "releaseLocal"]);
    expect(result).toMatchObject({ ok: true, routingCleared: true });
  });

  it("releases nothing when the provider will not stop routing it", async () => {
    const result = await releaseNumber(4, NUMBER.providerNumberId, {
      routeNumber: async () => { throw new Error("ProviderRefused"); },
      releaseLocal: async () => { throw new Error("must not be reached"); },
    });
    expect(result).toMatchObject({ ok: true, routingCleared: false });
  });

  it("releases nothing when routing cannot be changed from here", async () => {
    const result = await releaseNumber(4, NUMBER.providerNumberId, {});
    expect(result).toMatchObject({ ok: true, routingCleared: false });
  });
});
