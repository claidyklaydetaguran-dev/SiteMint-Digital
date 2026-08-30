// Milestone 2 foundation: persistence for real (Vapi + Twilio) call events.
//
// Deliberately additive-only against the existing, already-migrated schema
// (see docs/ai-receptionist/DATABASE_STRATEGY.md ADR-05) — no new table, no
// migration. Every real-call event is stored as its own row in the existing
// provider_webhook_events idempotency ledger; a call's current state is
// derived at read time by folding that firm's events for one call id
// (see callStateModel.ts). This keeps the write path trivial (a single
// indexed insert per webhook) and keeps the "what really happened" data
// exactly as delivered, rather than a derived summary that could drift.

import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { providerWebhookEvents, voiceAssistants } from "@workspace/db/schema/voice";
import type { ParsedVapiMessage } from "./vapiServerMessage.js";
import { buildVapiEventKey } from "./eventKey.js";
import { foldEventsIntoCallRecord, type RealCallRecord, type StoredVapiEvent } from "./callStateModel.js";

export const VAPI_PROVIDER_NAME = "vapi";

/**
 * Looks up the firm that owns a Vapi assistant id. Returns undefined for an
 * assistant SiteMint doesn't know about — the caller must never fall back to
 * a caller-supplied firm/account id in that case.
 */
export async function findFirmIdForVapiAssistant(providerAssistantId: string): Promise<number | undefined> {
  const [row] = await db
    .select({ firmId: voiceAssistants.firmId })
    .from(voiceAssistants)
    .where(
      and(
        eq(voiceAssistants.provider, VAPI_PROVIDER_NAME),
        eq(voiceAssistants.providerAssistantId, providerAssistantId),
      ),
    )
    .limit(1);
  return row?.firmId;
}

export interface StoreResult {
  /** False when an identical event was already stored (safe duplicate). */
  inserted: boolean;
}

/** Idempotent insert: a duplicate delivery of the same logical event is a no-op, never a duplicate row or a thrown error. */
export async function storeVapiWebhookEvent(firmId: number, message: ParsedVapiMessage): Promise<StoreResult> {
  const eventKey = buildVapiEventKey(message);
  const result = await db
    .insert(providerWebhookEvents)
    .values({
      firmId,
      provider: VAPI_PROVIDER_NAME,
      eventKey,
      payload: message as unknown as Record<string, unknown>,
      processedAt: new Date(),
    })
    .onConflictDoNothing({ target: [providerWebhookEvents.provider, providerWebhookEvents.eventKey] })
    .returning({ id: providerWebhookEvents.id });

  return { inserted: result.length > 0 };
}

function toStoredEvent(payload: unknown, createdAt: Date): StoredVapiEvent | undefined {
  const message = payload as ParsedVapiMessage;
  if (!message || typeof message !== "object" || typeof message.type !== "string") return undefined;
  return { type: message.type, message, createdAt };
}

/** All real-call records for one firm, most recently active first. Firm-scoped — cross-firm data can never appear here. */
export async function listRealCallsForFirm(firmId: number): Promise<RealCallRecord[]> {
  const rows = await db
    .select({
      payload: providerWebhookEvents.payload,
      createdAt: providerWebhookEvents.createdAt,
    })
    .from(providerWebhookEvents)
    .where(and(eq(providerWebhookEvents.firmId, firmId), eq(providerWebhookEvents.provider, VAPI_PROVIDER_NAME)))
    .orderBy(asc(providerWebhookEvents.createdAt));

  const byCallId = new Map<string, StoredVapiEvent[]>();
  for (const row of rows) {
    const message = row.payload as unknown as ParsedVapiMessage;
    const stored = toStoredEvent(row.payload, row.createdAt);
    if (!stored || !message.call?.id) continue;
    const list = byCallId.get(message.call.id) ?? [];
    list.push(stored);
    byCallId.set(message.call.id, list);
  }

  const records: RealCallRecord[] = [];
  for (const [callId, events] of byCallId) {
    const record = foldEventsIntoCallRecord(callId, events);
    if (record) records.push(record);
  }
  return records.sort((a, b) => b.lastEventAt.getTime() - a.lastEventAt.getTime());
}

/** One real-call record for one firm, or undefined if it doesn't exist or belongs to a different firm. */
export async function getRealCallForFirm(firmId: number, callId: string): Promise<RealCallRecord | undefined> {
  const calls = await listRealCallsForFirm(firmId);
  return calls.find((c) => c.callId === callId);
}

// ── P3: idempotent tool-call result replay ───────────────────────────────────
// A tool-calls delivery is stored in the same ledger as every other event.
// After execution, the produced results are written back onto that row so a
// provider REDELIVERY of the same batch is answered from storage — the
// mutating tools never run twice for one toolCallId.

export interface StoredToolCallResults {
  results: Array<{ toolCallId: string; result: string }>;
}

function isStoredResults(value: unknown): value is StoredToolCallResults {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as StoredToolCallResults).results)
  );
}

/** Reads previously stored results for one (provider, eventKey), if any. */
export async function readStoredToolCallResults(eventKey: string): Promise<StoredToolCallResults | undefined> {
  const [row] = await db
    .select({ payload: providerWebhookEvents.payload })
    .from(providerWebhookEvents)
    .where(and(eq(providerWebhookEvents.provider, VAPI_PROVIDER_NAME), eq(providerWebhookEvents.eventKey, eventKey)))
    .limit(1);
  if (!row) return undefined;
  const stored = (row.payload as Record<string, unknown>)["siteMintToolResults"];
  return isStoredResults(stored) ? stored : undefined;
}

/** Writes execution results onto the stored event row (merge, never replace the event payload). */
export async function storeToolCallResults(
  firmId: number,
  eventKey: string,
  results: StoredToolCallResults["results"],
): Promise<void> {
  const [row] = await db
    .select({ id: providerWebhookEvents.id, payload: providerWebhookEvents.payload })
    .from(providerWebhookEvents)
    .where(
      and(
        eq(providerWebhookEvents.firmId, firmId),
        eq(providerWebhookEvents.provider, VAPI_PROVIDER_NAME),
        eq(providerWebhookEvents.eventKey, eventKey),
      ),
    )
    .limit(1);
  if (!row) return;
  await db
    .update(providerWebhookEvents)
    .set({
      payload: { ...(row.payload as Record<string, unknown>), siteMintToolResults: { results } },
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(providerWebhookEvents.id, row.id));
}
