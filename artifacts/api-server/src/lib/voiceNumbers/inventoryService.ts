// Platform-operator view of telephone stock, and the one path by which a
// number comes to belong to a business.
//
// Why this exists. `receptionistNumbers.ts` manages rows a business already
// holds and deliberately contacts no provider; the acquisition seam
// (`numberService.createProductionPhoneNumberProvider`) still refuses to buy
// or import anything, because spending money is not a thing this should do on
// its own. What was missing between them is the ordinary case: the
// organisation ALREADY owns a number, and somebody with operator rights needs
// to see it and hand it to one business.
//
// Two rules shape everything here:
//
//   1. A business may never see, or name, stock it does not hold. Every
//      function in this file is called from an operator-authenticated route.
//      The customer-facing router reads only its own firm's rows and is
//      untouched.
//
//   2. A number is only "assigned" once the provider has confirmed it back.
//      A row written but unconfirmed is stored `paused` with a reason, never
//      `assigned` — because `assigned` is exactly what the customer-facing
//      capability reads to tell a business that transfers will work.

import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceNumbers } from "@workspace/db/schema/voice";

import type { VoicePhoneNumberRecord } from "../voice/types.js";

/** Why an assignment did not happen. Each maps to one operator-readable sentence. */
export type AssignRefusal =
  | "inventory_unreadable"
  | "not_in_provider_inventory"
  | "provider_routing_exists"
  | "held_by_another_business"
  | "firm_already_assigned"
  | "no_published_assistant"
  | "shape_rejected";

export interface LocalNumberRow {
  id: number;
  firmId: number | null;
  phoneE164: string;
  providerNumberId: string | null;
  state: string;
  pausedReason: string | null;
}

/** One line of the operator inventory view: what the provider says, plus who holds it here. */
export interface InventoryEntry extends VoicePhoneNumberRecord {
  /** The business holding it in SiteMint, or null when it is unclaimed stock. */
  heldByFirmId: number | null;
  /** The local lifecycle word, or null when SiteMint has never recorded it. */
  localState: string | null;
  localPausedReason: string | null;
}

export interface InventoryDeps {
  /** Absent when the configured provider cannot enumerate stock at all. */
  listProviderNumbers?: () => Promise<VoicePhoneNumberRecord[]>;
  readLocalNumbers: () => Promise<LocalNumberRow[]>;
}

export const productionInventoryDeps = (
  listProviderNumbers?: () => Promise<VoicePhoneNumberRecord[]>,
): InventoryDeps => ({
  ...(listProviderNumbers ? { listProviderNumbers } : {}),
  readLocalNumbers: async () =>
    db
      .select({
        id: voiceNumbers.id,
        firmId: voiceNumbers.firmId,
        phoneE164: voiceNumbers.phoneE164,
        providerNumberId: voiceNumbers.providerNumberId,
        state: voiceNumbers.state,
        pausedReason: voiceNumbers.pausedReason,
      })
      .from(voiceNumbers),
});

/** Matches a provider record to a local row by provider id first, then by number. */
export function findLocalMatch(
  record: Pick<VoicePhoneNumberRecord, "providerNumberId" | "e164">,
  local: readonly LocalNumberRow[],
): LocalNumberRow | undefined {
  return (
    local.find((r) => r.providerNumberId !== null && r.providerNumberId === record.providerNumberId) ??
    // Falls back to the number itself, so a row recorded before an id existed
    // is still recognised as the same telephone line rather than duplicated.
    local.find((r) => r.phoneE164 === record.e164)
  );
}

export type InventoryResult =
  | { ok: true; entries: InventoryEntry[] }
  | { ok: false; reason: "unreadable"; detail: string };

/**
 * The operator inventory view.
 *
 * An unreadable inventory is reported as unreadable. It is never flattened to
 * an empty list: "this organisation owns no numbers" and "nobody can tell you
 * what this organisation owns" are opposite answers, and only one of them
 * means stop.
 */
export async function readInventory(deps: InventoryDeps): Promise<InventoryResult> {
  if (!deps.listProviderNumbers) {
    return {
      ok: false,
      reason: "unreadable",
      detail: "The configured voice provider cannot list telephone numbers.",
    };
  }

  let provider: VoicePhoneNumberRecord[];
  try {
    provider = await deps.listProviderNumbers();
  } catch (err) {
    return {
      ok: false,
      reason: "unreadable",
      detail: err instanceof Error ? `The provider refused the inventory read (${err.name}).` : "The provider refused the inventory read.",
    };
  }

  const local = await deps.readLocalNumbers();
  return {
    ok: true,
    entries: provider.map((record) => {
      const match = findLocalMatch(record, local);
      return {
        ...record,
        heldByFirmId: match?.firmId ?? null,
        localState: match?.state ?? null,
        localPausedReason: match?.pausedReason ?? null,
      };
    }),
  };
}

// ── assignment ───────────────────────────────────────────────────────────────

export interface AssignInput {
  providerNumberId: string;
  firmId: number;
  /**
   * The provider already routes this number to one of its assistants. Assigning
   * it here takes that routing over, so it must be said out loud rather than
   * inferred from the operator having typed the id.
   */
  takeOverProviderRouting?: boolean;
}

export interface AssignDeps extends InventoryDeps {
  /**
   * The firm's published assistant. A number cannot be `assigned` without one —
   * the table refuses it, and rightly: a live number with nothing to ring is a
   * telephone that rings out.
   */
  findPublishedAssistantId: (firmId: number) => Promise<number | null>;
  /** The provider's own id for that assistant — what the number must be pointed at. */
  findProviderAssistantId: (firmId: number) => Promise<string | null>;
  /**
   * Points the number at the assistant AT THE PROVIDER, which is what actually
   * routes calls. Absent means routing cannot be changed, and the assignment
   * stays paused rather than claiming a telephone that does not ring.
   */
  routeNumber?: (providerNumberId: string, providerAssistantId: string | null) => Promise<VoicePhoneNumberRecord>;
  upsertAssignment: (input: {
    firmId: number;
    phoneE164: string;
    providerNumberId: string;
    acquisition: string;
    assignedAssistantId: number;
    state: "assigned" | "paused";
    pausedReason: string | null;
  }) => Promise<void>;
  /** Re-reads the ONE number from the provider after the local write. */
  confirmProviderNumber?: (providerNumberId: string) => Promise<VoicePhoneNumberRecord | null>;
}

export type AssignResult =
  | { ok: true; state: "assigned"; phoneE164: string }
  | { ok: true; state: "paused"; phoneE164: string; pausedReason: string; detail: string }
  | { ok: false; reason: AssignRefusal; detail: string };

const REFUSALS: Record<AssignRefusal, string> = {
  inventory_unreadable: "The provider inventory could not be read, so nothing was assigned.",
  not_in_provider_inventory: "No number with that id exists in the provider organisation.",
  provider_routing_exists:
    "The provider already routes that number to an assistant. Confirm the takeover explicitly to reassign it.",
  held_by_another_business: "Another business already holds that number.",
  firm_already_assigned: "That business already has an assigned number.",
  no_published_assistant:
    "That business has no published assistant, so there is nothing for the number to ring. Publish one first.",
  shape_rejected: "That is not a usable provider number id and firm id pair.",
};

function refuse(reason: AssignRefusal): AssignResult {
  return { ok: false, reason, detail: REFUSALS[reason] };
}

/**
 * Hands one number from organisation stock to one business.
 *
 * Order matters: every refusal is decided BEFORE anything is written, then the
 * write happens, then the provider is asked again. A row is only left in the
 * `assigned` state when that final read agrees — anything else is `paused`
 * with a reason an operator can act on, which is the recovery path for a
 * half-finished assignment.
 */
export async function assignNumberToFirm(input: AssignInput, deps: AssignDeps): Promise<AssignResult> {
  const providerNumberId = typeof input.providerNumberId === "string" ? input.providerNumberId.trim() : "";
  if (providerNumberId === "" || !Number.isInteger(input.firmId) || input.firmId <= 0) {
    return refuse("shape_rejected");
  }

  const inventory = await readInventory(deps);
  if (!inventory.ok) return refuse("inventory_unreadable");

  const record = inventory.entries.find((e) => e.providerNumberId === providerNumberId);
  if (!record) return refuse("not_in_provider_inventory");

  if (record.assignedAssistantId !== null && input.takeOverProviderRouting !== true) {
    return refuse("provider_routing_exists");
  }

  // Held elsewhere: a released row is not a holder, and the same firm asking
  // again is a retry rather than a conflict.
  if (
    record.heldByFirmId !== null &&
    record.heldByFirmId !== input.firmId &&
    record.localState !== "released"
  ) {
    return refuse("held_by_another_business");
  }

  const local = await deps.readLocalNumbers();
  const otherAssigned = local.find(
    (r) => r.firmId === input.firmId && r.state === "assigned" && r.providerNumberId !== providerNumberId,
  );
  if (otherAssigned) return refuse("firm_already_assigned");

  const assistantId = await deps.findPublishedAssistantId(input.firmId);
  if (assistantId === null) return refuse("no_published_assistant");

  // The provider's own word for where the number came from, mapped onto the
  // two acquisitions the table allows. Anything unrecognised is treated as a
  // brought-in number, which is the conservative of the two.
  const acquisition = record.origin === "vapi" ? "vapi_native" : "twilio_byo";

  // Written paused FIRST, so a crash between the write and the confirmation
  // leaves a number that plainly is not live rather than one that claims to be.
  await deps.upsertAssignment({
    firmId: input.firmId,
    phoneE164: record.e164,
    providerNumberId,
    acquisition,
    assignedAssistantId: assistantId,
    state: "paused",
    pausedReason: "assignment_unconfirmed",
  });

  const providerAssistantId = await deps.findProviderAssistantId(input.firmId);
  if (providerAssistantId === null) return refuse("no_published_assistant");

  if (!deps.routeNumber || !deps.confirmProviderNumber) {
    return {
      ok: true,
      state: "paused",
      phoneE164: record.e164,
      pausedReason: "assignment_unconfirmed",
      detail: "The number was recorded but its routing could not be changed, so it does not ring yet.",
    };
  }

  // The write that makes the telephone ring. Everything before this was
  // bookkeeping; a number recorded but not routed answers to nobody.
  try {
    await deps.routeNumber(providerNumberId, providerAssistantId);
  } catch {
    return {
      ok: true,
      state: "paused",
      phoneE164: record.e164,
      pausedReason: "routing_failed",
      detail: "The number was recorded, but the provider refused to route it to this assistant. It stays paused.",
    };
  }

  let confirmed: VoicePhoneNumberRecord | null;
  try {
    confirmed = await deps.confirmProviderNumber(providerNumberId);
  } catch {
    confirmed = null;
  }

  if (confirmed === null || confirmed.providerNumberId !== providerNumberId || confirmed.e164 !== record.e164) {
    return {
      ok: true,
      state: "paused",
      phoneE164: record.e164,
      pausedReason: "assignment_unconfirmed",
      detail:
        "The number was recorded, but re-reading it from the provider did not match. It stays paused until an operator resolves it.",
    };
  }

  // The provider must agree about WHERE it routes, not merely that the number
  // exists. Anything else and "assigned" would again mean less than it says.
  if (confirmed.assignedAssistantId !== providerAssistantId) {
    return {
      ok: true,
      state: "paused",
      phoneE164: record.e164,
      pausedReason: "routing_unconfirmed",
      detail:
        "The number was recorded, but the provider does not report it routed to this assistant. It stays paused.",
    };
  }

  await deps.upsertAssignment({
    firmId: input.firmId,
    phoneE164: record.e164,
    providerNumberId,
    acquisition,
    assignedAssistantId: assistantId,
    state: "assigned",
    pausedReason: null,
  });

  return { ok: true, state: "assigned", phoneE164: record.e164 };
}

/** The firm's published assistant row id, if it has one. */
export const productionFindPublishedAssistantId: AssignDeps["findPublishedAssistantId"] = async (firmId) => {
  const { voiceAssistants } = await import("@workspace/db/schema/voice");
  const [row] = await db
    .select({ id: voiceAssistants.id })
    .from(voiceAssistants)
    .where(and(eq(voiceAssistants.firmId, firmId), eq(voiceAssistants.status, "published")))
    .limit(1);
  return row?.id ?? null;
};

/** The PROVIDER's id for that assistant — the value a number must be pointed at. */
export const productionFindProviderAssistantId: AssignDeps["findProviderAssistantId"] = async (firmId) => {
  const { voiceAssistants } = await import("@workspace/db/schema/voice");
  const [row] = await db
    .select({ providerAssistantId: voiceAssistants.providerAssistantId })
    .from(voiceAssistants)
    .where(and(eq(voiceAssistants.firmId, firmId), eq(voiceAssistants.status, "published")))
    .limit(1);
  const id = row?.providerAssistantId ?? null;
  return typeof id === "string" && id.trim() !== "" ? id : null;
};

/** The production write: one row per telephone line, matched by provider id or number. */
export const productionAssignWrite: AssignDeps["upsertAssignment"] = async (input) => {
  const now = new Date();
  const [existing] = await db
    .select({ id: voiceNumbers.id })
    .from(voiceNumbers)
    .where(
      or(eq(voiceNumbers.providerNumberId, input.providerNumberId), eq(voiceNumbers.phoneE164, input.phoneE164)),
    )
    .limit(1);

  if (existing) {
    await db
      .update(voiceNumbers)
      .set({
        firmId: input.firmId,
        phoneE164: input.phoneE164,
        providerNumberId: input.providerNumberId,
        acquisition: input.acquisition,
        assignedAssistantId: input.assignedAssistantId,
        state: input.state,
        pausedReason: input.pausedReason,
        releasedAt: null,
        updatedAt: now,
      })
      .where(eq(voiceNumbers.id, existing.id));
    return;
  }

  await db.insert(voiceNumbers).values({
    firmId: input.firmId,
    phoneE164: input.phoneE164,
    providerNumberId: input.providerNumberId,
    acquisition: input.acquisition,
    assignedAssistantId: input.assignedAssistantId,
    state: input.state,
    pausedReason: input.pausedReason,
    createdAt: now,
    updatedAt: now,
  });
};

export type ReleaseResult =
  | { ok: true; routingCleared: true }
  | { ok: true; routingCleared: false; detail: string }
  | { ok: false; reason: "not_held" };

/**
 * Returns a number to stock — BOTH halves.
 *
 * Provider routing is cleared first, then the local row. That order is the
 * whole point: a number released locally while still pointed at the assistant
 * would keep delivering that business's calls to a business that gave it up.
 * If the provider refuses, the local row is left alone and the caller is told,
 * because a half-release that only we know about is worse than none.
 */
export async function releaseNumber(
  firmId: number,
  providerNumberId: string,
  deps: {
    routeNumber?: (id: string, assistantId: string | null) => Promise<unknown>;
    releaseLocal?: (firmId: number, providerNumberId: string) => Promise<boolean>;
  } = {},
): Promise<ReleaseResult> {
  if (deps.routeNumber) {
    try {
      await deps.routeNumber(providerNumberId, null);
    } catch {
      return {
        ok: true,
        routingCleared: false,
        detail:
          "The provider would not stop routing that number, so nothing was released. The business still holds it.",
      };
    }
  } else {
    return {
      ok: true,
      routingCleared: false,
      detail: "Routing cannot be changed from here, so nothing was released.",
    };
  }

  const released = await (deps.releaseLocal ?? releaseFirmNumber)(firmId, providerNumberId);
  return released ? { ok: true, routingCleared: true } : { ok: false, reason: "not_held" };
}

/** The local half of a release. Callers should prefer `releaseNumber`, which clears routing first. */
export async function releaseFirmNumber(firmId: number, providerNumberId: string): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .update(voiceNumbers)
    .set({
      firmId: null,
      // Cleared with the holder: a number back in stock must not keep pointing
      // at the assistant of the business that used to have it.
      assignedAssistantId: null,
      state: "inventory",
      pausedReason: null,
      releasedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(voiceNumbers.providerNumberId, providerNumberId),
        eq(voiceNumbers.firmId, firmId),
        ne(voiceNumbers.state, "released"),
      ),
    )
    .returning({ id: voiceNumbers.id });
  return rows.length > 0;
};
