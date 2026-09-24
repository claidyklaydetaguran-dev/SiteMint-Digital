// P6: firm-facing number + transfer-destination management. Authenticated,
// firm-scoped, state-machine-guarded. NOTHING here contacts a provider —
// acquisition/release live behind the owner-gated PhoneNumberProvider seam,
// and this surface only manages rows that inventory intake (a later
// activation) will create. Provider number ids are never exposed to the
// browser; numbers are presented by E.164 and state only.

import { Router, type Request, type Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceNumbers, voiceAssistants } from "@workspace/db/schema/voice";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { canTransition, type NumberState } from "../lib/voiceNumbers/numberService.js";
import {
  createTransferContact,
  deleteTransferContact,
  getTransferContact,
  listTransferContacts,
  updateTransferContact,
  validateTransferContact,
} from "../lib/voiceTransferContacts/transferContactService.js";

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

// ── transfer destinations (DEPRECATED) ───────────────────────────────────────
//
// Superseded by /receptionist/voice/transfer-contacts, which is what the
// dashboard uses. These paths are kept because an outside caller cannot be ruled
// out by grepping this repository — "no frontend uses it" is not proof that
// nothing does — but they no longer carry a SECOND validation path.
//
// They now delegate to the same service the current surface uses, so both get
// the same normalization, the same duplicate rule and the same per-business cap
// (previously only this route capped, and the newer one did not cap at all).
//
// What this surface cannot set is the newer contact detail: role, own hours,
// default, and the authorization stamp. That is deliberate. A destination
// created here has no recorded consent, and `resolveTransferDestination`
// refuses to hand a caller to a destination without one — so this route can add
// a row but can never, by itself, cause a call to be placed.
//
// Response shapes and status codes are unchanged. Every response additionally
// carries Deprecation and Link headers naming the replacement.

const DEPRECATION_LINK = '</api/receptionist/voice/transfer-contacts>; rel="successor-version"';

function markDeprecated(res: Response): void {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", DEPRECATION_LINK);
}

router.get("/receptionist/voice/transfer-destinations", requireReceptionistAuth, async (req: Request, res: Response) => {
  markDeprecated(res);
  const rows = await listTransferContacts(req.firmId!);
  res.json({ items: rows, count: rows.length });
});

router.post("/receptionist/voice/transfer-destinations", requireReceptionistAuth, async (req: Request, res: Response) => {
  markDeprecated(res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  // The legacy body shape, mapped onto the shared validator. Consent is never
  // implied here — this surface has no way to assert it.
  const validated = validateTransferContact({
    label: body.label,
    phone: body.phone,
    countryCode: body.countryCode,
    priority: Number.isInteger(body.priority) ? body.priority : 100,
    businessHoursOnly: body.businessHoursOnly !== false,
    active: true,
    useBusinessHours: true,
    consentConfirmed: false,
  });
  if (!validated.ok) {
    res.status(400).json({ error: validated.errors[0]!.message, errors: validated.errors });
    return;
  }
  const created = await createTransferContact(req.firmId!, validated.value, req.firmEmail ?? "unknown");
  if (!created.ok) {
    // Both the duplicate-number and the cap rejection were 409 here before.
    res.status(409).json({ error: created.errors[0]!.message, errors: created.errors });
    return;
  }
  const row = await getTransferContact(req.firmId!, created.id);
  res.status(201).json({ destination: row });
});

router.patch("/receptionist/voice/transfer-destinations/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  markDeprecated(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid destination id." });
    return;
  }
  const current = await getTransferContact(req.firmId!, id);
  if (!current) {
    res.status(404).json({ error: "Destination not found." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  // A partial legacy patch, applied over the row as it stands, so the fields
  // this surface cannot express are preserved rather than reset. The legacy
  // handler silently ignored an out-of-range label; the shared validator
  // rejects it, which is the stricter and more honest answer.
  const validated = validateTransferContact({
    label: typeof body.label === "string" ? body.label : current.label,
    phone: current.phoneE164,
    contactRole: current.contactRole,
    roleLabel: current.roleLabel ?? undefined,
    useBusinessHours: current.hoursStartMinute === null,
    timezone: current.timezone ?? undefined,
    hoursStartMinute: current.hoursStartMinute ?? undefined,
    hoursEndMinute: current.hoursEndMinute ?? undefined,
    businessHoursOnly:
      typeof body.businessHoursOnly === "boolean" ? body.businessHoursOnly : current.businessHoursOnly,
    active: typeof body.active === "boolean" ? body.active : current.active,
    priority: Number.isInteger(body.priority) ? body.priority : current.priority,
    isDefault: current.isDefault,
    consentConfirmed: current.consentConfirmedAt !== null,
  });
  if (!validated.ok) {
    res.status(400).json({ error: validated.errors[0]!.message, errors: validated.errors });
    return;
  }
  const updated = await updateTransferContact(req.firmId!, id, validated.value, req.firmEmail ?? "unknown");
  if (!updated.ok) {
    const notFound = updated.errors.some((e) => e.code === "not_found");
    res.status(notFound ? 404 : 400).json({ error: updated.errors[0]!.message, errors: updated.errors });
    return;
  }
  res.json({ destination: await getTransferContact(req.firmId!, id) });
});

router.delete("/receptionist/voice/transfer-destinations/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  markDeprecated(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid destination id." });
    return;
  }
  const removed = await deleteTransferContact(req.firmId!, id);
  if (!removed) {
    res.status(404).json({ error: "Destination not found." });
    return;
  }
  res.status(204).end();
});

// Referenced by transitions but not part of the HTTP surface yet: released
// numbers keep their rows (releasedAt set) for auditability.
export const _internal = { inArray };

export default router;
