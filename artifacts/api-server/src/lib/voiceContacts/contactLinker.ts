// P5: vertical-neutral caller identity. A voice caller is a
// (firm, E.164 number) pair in voice_contacts; every call links to exactly
// one contact via voice_call_links; and when the same number already has an
// intake SMS conversation, the contact records that association READ-ONLY —
// nothing here ever writes to an intake_* table.
//
// Import hygiene: pure normalization is exported for tests; the linker's
// database collaborators are injectable, with lazy production defaults.

export interface NormalizedPhone {
  e164: string;
}

/**
 * Conservative E.164 normalization: accepts "+<digits>", bare 10-digit NANP
 * (assumed +1), or 11-digit NANP starting with 1. Everything else is
 * rejected rather than guessed — a wrong identity is worse than none.
 */
export function normalizePhoneE164(raw: string | undefined | null): NormalizedPhone | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (hasPlus) {
    if (digits.length < 7 || digits.length > 15 || digits.startsWith("0")) return undefined;
    return { e164: `+${digits}` };
  }
  if (digits.length === 10 && !digits.startsWith("0") && !digits.startsWith("1")) {
    return { e164: `+1${digits}` };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return { e164: `+${digits}` };
  }
  return undefined;
}

export interface ContactLinkerDeps {
  now?: () => Date;
  upsertContact: (input: {
    firmId: number;
    phoneE164: string;
    displayName?: string;
    callId: string;
    now: Date;
  }) => Promise<{ contactId: number }>;
  linkCall: (firmId: number, callId: string, contactId: number) => Promise<void>;
  /** Read-only: newest intake conversation id for the same firm+number, if any. */
  findIntakeConversationId: (firmId: number, phoneE164: string) => Promise<number | undefined>;
  setIntakeAssociation: (firmId: number, contactId: number, conversationId: number) => Promise<void>;
  logger?: (event: string, meta: Record<string, unknown>) => void;
}

async function productionDeps(): Promise<ContactLinkerDeps> {
  const { db } = await import("@workspace/db");
  const { voiceContacts, voiceCallLinks } = await import("@workspace/db/schema/voice");
  const { intakeConversations } = await import("@workspace/db/schema");
  const { and, eq, desc, sql } = await import("drizzle-orm");
  return {
    upsertContact: async ({ firmId, phoneE164, displayName, callId, now }) => {
      const [row] = await db
        .insert(voiceContacts)
        .values({
          firmId,
          phoneE164,
          displayName: displayName ?? null,
          lastCallId: callId,
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [voiceContacts.firmId, voiceContacts.phoneE164],
          set: {
            lastSeenAt: now,
            lastCallId: callId,
            updatedAt: now,
            // Keep the latest non-empty name; never blank out an existing one.
            ...(displayName ? { displayName } : {}),
          },
        })
        .returning({ contactId: voiceContacts.id });
      if (!row) throw new Error("voice contact upsert returned no row");
      return row;
    },
    linkCall: async (firmId, callId, contactId) => {
      await db
        .insert(voiceCallLinks)
        .values({ firmId, callId, contactId })
        .onConflictDoNothing({ target: [voiceCallLinks.firmId, voiceCallLinks.callId] });
    },
    findIntakeConversationId: async (firmId, phoneE164) => {
      const [row] = await db
        .select({ id: intakeConversations.id })
        .from(intakeConversations)
        .where(and(eq(intakeConversations.firmId, firmId), eq(intakeConversations.callerPhone, phoneE164)))
        .orderBy(desc(intakeConversations.id))
        .limit(1);
      return row?.id;
    },
    setIntakeAssociation: async (firmId, contactId, conversationId) => {
      await db
        .update(voiceContacts)
        .set({ intakeConversationId: conversationId, updatedAt: sql`now()` })
        .where(and(eq(voiceContacts.id, contactId), eq(voiceContacts.firmId, firmId)));
    },
  };
}

export interface LinkResult {
  linked: boolean;
  reason?: "unusable_number";
  contactId?: number;
}

/**
 * Idempotently links one call to a firm-scoped contact. Safe to call on
 * every end-of-call event: upserts are conflict-driven, the call link is
 * insert-once, and a redelivered event converges on the same rows.
 */
export async function linkCallToContact(
  firmId: number,
  callId: string,
  rawCallerNumber: string | undefined,
  displayName: string | undefined,
  deps?: ContactLinkerDeps,
): Promise<LinkResult> {
  const normalized = normalizePhoneE164(rawCallerNumber);
  if (!normalized) return { linked: false, reason: "unusable_number" };
  const resolved = deps ?? (await productionDeps());
  const now = resolved.now?.() ?? new Date();

  const { contactId } = await resolved.upsertContact({
    firmId,
    phoneE164: normalized.e164,
    ...(displayName ? { displayName } : {}),
    callId,
    now,
  });
  await resolved.linkCall(firmId, callId, contactId);

  try {
    const conversationId = await resolved.findIntakeConversationId(firmId, normalized.e164);
    if (conversationId !== undefined) {
      await resolved.setIntakeAssociation(firmId, contactId, conversationId);
    }
  } catch {
    // The association is a convenience; identity and linkage stand without it.
  }
  resolved.logger?.("voice_contact_linked", { firmId, contactId });
  return { linked: true, contactId };
}
