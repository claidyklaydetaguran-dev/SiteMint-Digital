// P6: the phone-number state machine, inbound routing resolution, and
// approved-transfer-destination logic. Pure decision functions + injectable
// repositories (lazy production defaults), matching the P2–P5 pattern.
//
// NOTHING here contacts a provider. Acquisition (Twilio purchase, Vapi BYO
// import) is deliberately a provider-abstraction seam with fakes only; the
// live implementations are an owner-gated activation deliverable.

import type { VoiceNumber, VoiceTransferDestination } from "@workspace/db/schema/voice";

export type NumberState = "inventory" | "assigned" | "paused" | "released";

/** The complete legal transition table — anything absent is refused. */
const TRANSITIONS: Record<NumberState, readonly NumberState[]> = {
  inventory: ["assigned", "released"],
  assigned: ["paused", "released"],
  paused: ["assigned", "released"],
  released: [],
};

export function canTransition(from: NumberState, to: NumberState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ── provider acquisition seam (fakes only in this phase) ─────────────────────

export interface AcquiredNumber {
  phoneE164: string;
  providerNumberId: string;
}

/**
 * The only surface a live acquisition implementation may fill. Purchasing,
 * importing, or releasing at Twilio/Vapi is an owner-gated hard stop; the
 * production factory therefore always throws until that activation lands.
 */
export interface PhoneNumberProvider {
  importTwilioNumber(phoneE164: string): Promise<AcquiredNumber>;
  releaseProviderNumber(providerNumberId: string): Promise<void>;
}

export function createProductionPhoneNumberProvider(): PhoneNumberProvider {
  return {
    async importTwilioNumber(): Promise<AcquiredNumber> {
      throw new Error("Live number acquisition is owner-gated and not activated.");
    },
    async releaseProviderNumber(): Promise<void> {
      throw new Error("Live number release is owner-gated and not activated.");
    },
  };
}

/** Deterministic fake for tests and future staging drills. */
export class FakePhoneNumberProvider implements PhoneNumberProvider {
  readonly imported: string[] = [];
  readonly released: string[] = [];
  async importTwilioNumber(phoneE164: string): Promise<AcquiredNumber> {
    this.imported.push(phoneE164);
    return { phoneE164, providerNumberId: `fake-pn-${this.imported.length}` };
  }
  async releaseProviderNumber(providerNumberId: string): Promise<void> {
    this.released.push(providerNumberId);
  }
}

// ── inbound routing ──────────────────────────────────────────────────────────

export interface NumberRoutingDeps {
  findByProviderNumberId: (providerNumberId: string) => Promise<VoiceNumber | undefined>;
  findAssistantProviderId: (firmId: number, assistantId: number) => Promise<string | undefined>;
}

async function productionRoutingDeps(): Promise<NumberRoutingDeps> {
  const { db } = await import("@workspace/db");
  const { voiceNumbers, voiceAssistants } = await import("@workspace/db/schema/voice");
  const { and, eq } = await import("drizzle-orm");
  return {
    findByProviderNumberId: async (providerNumberId) => {
      const [row] = await db.select().from(voiceNumbers).where(eq(voiceNumbers.providerNumberId, providerNumberId)).limit(1);
      return row;
    },
    findAssistantProviderId: async (firmId, assistantId) => {
      const [row] = await db
        .select({ providerAssistantId: voiceAssistants.providerAssistantId })
        .from(voiceAssistants)
        .where(and(eq(voiceAssistants.firmId, firmId), eq(voiceAssistants.id, assistantId)))
        .limit(1);
      return row?.providerAssistantId ?? undefined;
    },
  };
}

export type AssistantResolution =
  | { ok: true; providerAssistantId: string; firmId: number }
  | { ok: false; reason: "unknown_number" | "not_assigned" | "paused" | "assistant_unlinked" };

/**
 * Resolves the assistant for an inbound call on a provider number id — the
 * assistant-request answer. Only an 'assigned' number with a provider-linked
 * assistant routes; a paused number deliberately routes nowhere (the caller
 * hears the provider's failure behavior rather than a half-configured firm).
 * The provider assistant id returned here goes back to the PROVIDER itself,
 * never to any client — the confinement rule is about browsers and DTOs.
 */
export async function resolveAssistantForNumber(
  providerNumberId: string,
  deps?: NumberRoutingDeps,
): Promise<AssistantResolution> {
  const resolved = deps ?? (await productionRoutingDeps());
  const number = await resolved.findByProviderNumberId(providerNumberId);
  if (!number) return { ok: false, reason: "unknown_number" };
  if (number.state === "paused") return { ok: false, reason: "paused" };
  if (number.state !== "assigned" || number.firmId === null || number.assignedAssistantId === null) {
    return { ok: false, reason: "not_assigned" };
  }
  const providerAssistantId = await resolved.findAssistantProviderId(number.firmId, number.assignedAssistantId);
  if (!providerAssistantId) return { ok: false, reason: "assistant_unlinked" };
  return { ok: true, providerAssistantId, firmId: number.firmId };
}

// ── transfer destination resolution ──────────────────────────────────────────

export interface TransferResolutionDeps {
  listActiveDestinations: (firmId: number) => Promise<VoiceTransferDestination[]>;
  /** Business-hours check in the firm's own timezone/schedule. */
  isWithinBusinessHours: (firmId: number, now: Date) => Promise<boolean>;
  now?: () => Date;
}

async function productionTransferDeps(): Promise<TransferResolutionDeps> {
  const { db } = await import("@workspace/db");
  const { voiceTransferDestinations } = await import("@workspace/db/schema/voice");
  const { and, eq, asc } = await import("drizzle-orm");
  const scheduling = await import("../scheduling/schedulingRepository.js");
  const zoned = await import("../scheduling/zonedTime.js");
  return {
    listActiveDestinations: async (firmId) =>
      db
        .select()
        .from(voiceTransferDestinations)
        .where(and(eq(voiceTransferDestinations.firmId, firmId), eq(voiceTransferDestinations.active, true)))
        .orderBy(asc(voiceTransferDestinations.priority), asc(voiceTransferDestinations.id)),
    isWithinBusinessHours: async (firmId, now) => {
      const config = await scheduling.buildAvailabilityConfig(firmId);
      const parts = zoned.utcToZonedParts(config.timezone, now);
      const hours = config.weeklyHours[parts.weekday];
      if (!hours) return false;
      const toMinutes = (hhmm: string): number => {
        const [h, m] = hhmm.split(":").map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      const minutesOfDay = parts.hour * 60 + parts.minute;
      return minutesOfDay >= toMinutes(hours.start) && minutesOfDay < toMinutes(hours.end);
    },
  };
}

export type TransferResolution =
  | { ok: true; destinationE164: string; label: string }
  | { ok: false; reason: "no_destinations" | "after_hours" };

/**
 * Picks the transfer destination for an in-call escalation:
 * lowest-priority active destination whose hours policy admits `now`.
 * After-hours, destinations marked business_hours_only are skipped; if an
 * always-on destination exists it wins, otherwise the caller is told the
 * office is closed (the assistant takes a message instead — failure
 * behavior is a spoken outcome, never a dropped call).
 */
export async function resolveTransferDestination(
  firmId: number,
  deps?: TransferResolutionDeps,
): Promise<TransferResolution> {
  const resolved = deps ?? (await productionTransferDeps());
  const now = resolved.now?.() ?? new Date();
  const destinations = await resolved.listActiveDestinations(firmId);
  if (destinations.length === 0) return { ok: false, reason: "no_destinations" };

  const withinHours = await resolved.isWithinBusinessHours(firmId, now);
  const eligible = destinations.filter((d) => withinHours || !d.businessHoursOnly);
  if (eligible.length === 0) return { ok: false, reason: "after_hours" };
  const chosen = eligible[0]!;
  return { ok: true, destinationE164: chosen.phoneE164, label: chosen.label };
}

// ── inbound-SMS tenant resolution ────────────────────────────────────────────

export interface SmsTenantDeps {
  /** The owning firm of an in-service (assigned/paused) number, if any. */
  findOwningFirmByE164: (phoneE164: string) => Promise<number | undefined>;
}

async function productionSmsTenantDeps(): Promise<SmsTenantDeps> {
  const { db } = await import("@workspace/db");
  const { voiceNumbers } = await import("@workspace/db/schema/voice");
  const { and, eq, inArray, isNotNull } = await import("drizzle-orm");
  return {
    findOwningFirmByE164: async (phoneE164) => {
      const [row] = await db
        .select({ firmId: voiceNumbers.firmId })
        .from(voiceNumbers)
        .where(
          and(
            eq(voiceNumbers.phoneE164, phoneE164),
            inArray(voiceNumbers.state, ["assigned", "paused"]),
            isNotNull(voiceNumbers.firmId),
          ),
        )
        .limit(1);
      return row?.firmId ?? undefined;
    },
  };
}

/**
 * Maps an inbound SMS destination (the Twilio `To` number) to its firm via
 * the number inventory — the P5-documented replacement for the interim
 * VOICE_SMS_OWNER_FIRM_ID mapping. `phone_e164` is globally unique, so the
 * answer is unambiguous; a released or inventory number maps to nobody
 * (consent for a firm must never update through a number it no longer
 * operates). Callers may still fall back to the env pin when the inventory
 * has no rows (pre-inventory deployments).
 */
export async function resolveFirmIdForInboundSmsNumber(
  toE164: string,
  deps?: SmsTenantDeps,
): Promise<number | undefined> {
  const resolved = deps ?? (await productionSmsTenantDeps());
  return resolved.findOwningFirmByE164(toE164);
}

// ── emergency-language scan ──────────────────────────────────────────────────

const EMERGENCY_PATTERNS: readonly RegExp[] = [
  /\b911\b/,
  /\bemergency\b/i,
  /\bsuicid/i,
  /\bkill (myself|himself|herself|themselves)\b/i,
  /\bchest pains?\b/i,
  /\bcan'?t breathe\b/i,
  /\bheart attack\b/i,
  /\bstroke\b/i,
  /\boverdose\b/i,
  /\bbleeding (badly|out)\b/i,
];

/**
 * Conservative keyword scan over a call transcript. This is a FLAG for
 * operator attention (a critical voice_issue), never medical or legal
 * handling logic — the assistant's system prompt carries the "hang up and
 * call 911" instruction; this makes sure a human sees that it happened.
 */
export function scanEmergencyLanguage(transcript: string | undefined): { flagged: boolean; pattern?: string } {
  if (!transcript) return { flagged: false };
  for (const pattern of EMERGENCY_PATTERNS) {
    if (pattern.test(transcript)) return { flagged: true, pattern: pattern.source };
  }
  return { flagged: false };
}
