// P6: firm-facing number + transfer-destination management. Authenticated,
// firm-scoped, state-machine-guarded. NOTHING here contacts a provider —
// acquisition/release live behind the owner-gated PhoneNumberProvider seam,
// and this surface only manages rows that inventory intake (a later
// activation) will create. Provider number ids are never exposed to the
// browser; numbers are presented by E.164 and state only.

import { Router, type Request, type Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceNumbers, voiceTransferDestinations, voiceAssistants } from "@workspace/db/schema/voice";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { canTransition, type NumberState } from "../lib/voiceNumbers/numberService.js";
import { normalizePhoneE164 } from "../lib/voiceContacts/contactLinker.js";

const router = Router();

function numberDto(row: typeof voiceNumbers.$inferSelect) {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    state: row.state,
    acquisition: row.acquisition,
    assignedAssistantId: row.assignedAssistantId,
    pausedReason: row.pausedReason,
    // providerNumberId deliberately absent — provider identifiers never
    // reach a client (same confinement rule as assistant ids).
  };
}

// ── numbers ──────────────────────────────────────────────────────────────────

router.get("/receptionist/voice/numbers", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(voiceNumbers)
      .where(eq(voiceNumbers.firmId, req.firmId!))
      .orderBy(asc(voiceNumbers.id));
    res.json({ items: rows.map(numberDto), count: rows.length });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[numbers] list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

async function transitionOwnNumber(
  req: Request,
  res: Response,
  to: NumberState,
  extra: Partial<typeof voiceNumbers.$inferInsert> = {},
): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid number id." });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(voiceNumbers)
      .where(and(eq(voiceNumbers.id, id), eq(voiceNumbers.firmId, req.firmId!)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Number not found." });
      return;
    }
    if (!canTransition(row.state as NumberState, to)) {
      res.status(409).json({ error: `A ${row.state} number cannot become ${to}.` });
      return;
    }
    const [updated] = await db
      .update(voiceNumbers)
      .set({ state: to, updatedAt: new Date(), ...extra })
      .where(and(eq(voiceNumbers.id, id), eq(voiceNumbers.firmId, req.firmId!), eq(voiceNumbers.state, row.state)))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "The number changed state concurrently; reload and retry." });
      return;
    }
    res.json({ number: numberDto(updated) });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[numbers] transition failed");
    res.status(500).json({ error: "Internal error" });
  }
}

router.post("/receptionist/voice/numbers/:id/assign", requireReceptionistAuth, async (req: Request, res: Response) => {
  const assistantId = Number((req.body as Record<string, unknown> | undefined)?.assistantId);
  if (!Number.isInteger(assistantId)) {
    res.status(400).json({ error: "assistantId is required." });
    return;
  }
  // The assistant must be this firm's, published, and provider-linked —
  // routing an inbound call to an unlinked assistant answers nothing.
  const [assistant] = await db
    .select({ id: voiceAssistants.id, status: voiceAssistants.status, providerAssistantId: voiceAssistants.providerAssistantId })
    .from(voiceAssistants)
    .where(and(eq(voiceAssistants.id, assistantId), eq(voiceAssistants.firmId, req.firmId!)))
    .limit(1);
  if (!assistant || assistant.status !== "published" || !assistant.providerAssistantId) {
    res.status(409).json({ error: "The assistant must be published before a number can route to it." });
    return;
  }
  await transitionOwnNumber(req, res, "assigned", { assignedAssistantId: assistantId, pausedReason: null });
});

router.post("/receptionist/voice/numbers/:id/pause", requireReceptionistAuth, async (req: Request, res: Response) => {
  const reasonRaw = (req.body as Record<string, unknown> | undefined)?.reason;
  const reason = typeof reasonRaw === "string" && reasonRaw.trim().length > 0 ? reasonRaw.trim().slice(0, 200) : "paused by owner";
  await transitionOwnNumber(req, res, "paused", { pausedReason: reason });
});

router.post("/receptionist/voice/numbers/:id/unpause", requireReceptionistAuth, async (req: Request, res: Response) => {
  // paused → assigned requires the assistant link to still exist; the CHECK
  // constraint enforces it at the database as well.
  const id = Number(req.params.id);
  if (Number.isInteger(id)) {
    const [row] = await db
      .select({ assignedAssistantId: voiceNumbers.assignedAssistantId })
      .from(voiceNumbers)
      .where(and(eq(voiceNumbers.id, id), eq(voiceNumbers.firmId, req.firmId!)))
      .limit(1);
    if (row && row.assignedAssistantId === null) {
      res.status(409).json({ error: "Re-assign an assistant before unpausing." });
      return;
    }
  }
  await transitionOwnNumber(req, res, "assigned", { pausedReason: null });
});

// ── transfer destinations ────────────────────────────────────────────────────

const MAX_DESTINATIONS = 10;

router.get("/receptionist/voice/transfer-destinations", requireReceptionistAuth, async (req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(voiceTransferDestinations)
    .where(eq(voiceTransferDestinations.firmId, req.firmId!))
    .orderBy(asc(voiceTransferDestinations.priority), asc(voiceTransferDestinations.id));
  res.json({ items: rows, count: rows.length });
});

router.post("/receptionist/voice/transfer-destinations", requireReceptionistAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const normalized = normalizePhoneE164(typeof body.phone === "string" ? body.phone : undefined);
  const priority = Number.isInteger(body.priority) ? (body.priority as number) : 100;
  const businessHoursOnly = body.businessHoursOnly !== false;
  if (label.length === 0 || label.length > 80 || !normalized) {
    res.status(400).json({ error: "A label (1-80 chars) and a valid phone number are required." });
    return;
  }
  const existing = await db
    .select({ id: voiceTransferDestinations.id })
    .from(voiceTransferDestinations)
    .where(eq(voiceTransferDestinations.firmId, req.firmId!));
  if (existing.length >= MAX_DESTINATIONS) {
    res.status(409).json({ error: `At most ${MAX_DESTINATIONS} destinations are supported.` });
    return;
  }
  try {
    const [row] = await db
      .insert(voiceTransferDestinations)
      .values({ firmId: req.firmId!, label, phoneE164: normalized.e164, priority, businessHoursOnly })
      .returning();
    res.status(201).json({ destination: row });
  } catch {
    res.status(409).json({ error: "That number is already a destination." });
  }
});

router.patch("/receptionist/voice/transfer-destinations/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid destination id." });
    return;
  }
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.label === "string" && body.label.trim().length > 0 && body.label.trim().length <= 80) set.label = body.label.trim();
  if (typeof body.active === "boolean") set.active = body.active;
  if (typeof body.businessHoursOnly === "boolean") set.businessHoursOnly = body.businessHoursOnly;
  if (Number.isInteger(body.priority)) set.priority = body.priority;
  const [row] = await db
    .update(voiceTransferDestinations)
    .set(set)
    .where(and(eq(voiceTransferDestinations.id, id), eq(voiceTransferDestinations.firmId, req.firmId!)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Destination not found." });
    return;
  }
  res.json({ destination: row });
});

router.delete("/receptionist/voice/transfer-destinations/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid destination id." });
    return;
  }
  const rows = await db
    .delete(voiceTransferDestinations)
    .where(and(eq(voiceTransferDestinations.id, id), eq(voiceTransferDestinations.firmId, req.firmId!)))
    .returning({ id: voiceTransferDestinations.id });
  if (rows.length === 0) {
    res.status(404).json({ error: "Destination not found." });
    return;
  }
  res.status(204).end();
});

// Referenced by transitions but not part of the HTTP surface yet: released
// numbers keep their rows (releasedAt set) for auditability.
export const _internal = { inArray };

export default router;
