// V7: business-managed transfer contacts.
//
// Two things this file is careful about.
//
// 1. SAVING NEVER DIALS. Create and update write a row and return. A business
//    can configure its contacts today and test when the person is actually
//    available. The test action is separate, explicit, and confirmed.
//
// 2. A TEST REPORTS WHAT IT ACTUALLY DID. `POST /:id/test` runs the real
//    server-side resolution — the same code path a live call uses — and returns
//    what it found. It does NOT dial, and it does not record a test outcome,
//    because a preflight that resolved a destination has proven nothing about
//    whether a phone rings. `lastTestOutcome` is written only from an observed
//    transfer during a real call.
//
//    The response says which mode applies. Until a phone number is assigned to
//    this business, a completed transfer is not reachable at all — a browser
//    test call has no telephone leg to hand over — and the interface must say so
//    rather than offering a button that cannot work.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  CONTACT_ROLES,
  createTransferContact,
  deleteTransferContact,
  formatE164ForDisplay,
  getTransferContact,
  listTransferContacts,
  updateTransferContact,
  validateTransferContact,
} from "../lib/voiceTransferContacts/transferContactService.js";
import { resolveTransferDestination } from "../lib/voiceNumbers/numberService.js";
import type { VoiceTransferDestination } from "@workspace/db/schema/voice";

const router = Router();

function parseId(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

function serializeContact(row: VoiceTransferDestination) {
  return {
    id: row.id,
    label: row.label,
    phoneE164: row.phoneE164,
    phoneDisplay: formatE164ForDisplay(row.phoneE164),
    contactRole: row.contactRole,
    roleLabel: row.roleLabel,
    useBusinessHours: row.hoursStartMinute === null,
    timezone: row.timezone,
    hoursStartMinute: row.hoursStartMinute,
    hoursEndMinute: row.hoursEndMinute,
    businessHoursOnly: row.businessHoursOnly,
    active: row.active,
    priority: row.priority,
    isDefault: row.isDefault,
    consentConfirmed: row.consentConfirmedAt !== null,
    consentConfirmedAt: row.consentConfirmedAt?.toISOString() ?? null,
    consentConfirmedBy: row.consentConfirmedBy,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestOutcome: row.lastTestOutcome,
  };
}

/** Does this business have a telephone number through which a transfer could complete? */
async function hasAssignedNumber(firmId: number): Promise<boolean> {
  const { db } = await import("@workspace/db");
  const { voiceNumbers } = await import("@workspace/db/schema/voice");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db
    .select({ id: voiceNumbers.id })
    .from(voiceNumbers)
    .where(and(eq(voiceNumbers.firmId, firmId), eq(voiceNumbers.state, "assigned")))
    .limit(1);
  return Boolean(row);
}

// ── GET /api/receptionist/voice/transfer-contacts ─────────────────────────────

router.get("/receptionist/voice/transfer-contacts", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const [rows, numberAssigned] = await Promise.all([
      listTransferContacts(req.firmId!),
      hasAssignedNumber(req.firmId!),
    ]);
    res.json({
      items: rows.map(serializeContact),
      count: rows.length,
      roles: CONTACT_ROLES,
      // What the interface needs in order to be truthful about testing.
      capability: {
        telephoneTransferAvailable: numberAssigned,
        browserTransferAvailable: false,
        explanation: numberAssigned
          ? "A caller on your phone number can be handed to a transfer contact. Browser test calls stay in the browser and cannot be handed over."
          : "Transfers need a phone number for this business. You can set contacts up now; handing a caller over becomes available once your number is live. Browser test calls stay in the browser and cannot be handed over.",
      },
    });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to list transfer contacts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/receptionist/voice/transfer-contacts ────────────────────────────

router.post("/receptionist/voice/transfer-contacts", requireReceptionistAuth, async (req: Request, res: Response) => {
  const validated = validateTransferContact((req.body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    res.status(400).json({ errors: validated.errors });
    return;
  }
  try {
    const created = await createTransferContact(req.firmId!, validated.value, req.firmEmail ?? "unknown");
    if (!created.ok) {
      res.status(400).json({ errors: created.errors });
      return;
    }
    const row = await getTransferContact(req.firmId!, created.id);
    // Saving a contact deliberately does not dial it.
    res.status(201).json({ contact: row ? serializeContact(row) : null, dialed: false });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to create transfer contact");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/receptionist/voice/transfer-contacts/:id ───────────────────────

router.patch(
  "/receptionist/voice/transfer-contacts/:id",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid contact id" });
      return;
    }
    const validated = validateTransferContact((req.body ?? {}) as Record<string, unknown>);
    if (!validated.ok) {
      res.status(400).json({ errors: validated.errors });
      return;
    }
    try {
      const updated = await updateTransferContact(req.firmId!, id, validated.value, req.firmEmail ?? "unknown");
      if (!updated.ok) {
        const notFound = updated.errors.some((e) => e.code === "not_found");
        res.status(notFound ? 404 : 400).json({ errors: updated.errors });
        return;
      }
      const row = await getTransferContact(req.firmId!, id);
      res.json({ contact: row ? serializeContact(row) : null, dialed: false });
    } catch (err) {
      req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to update transfer contact");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── DELETE /api/receptionist/voice/transfer-contacts/:id ──────────────────────

router.delete(
  "/receptionist/voice/transfer-contacts/:id",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid contact id" });
      return;
    }
    try {
      const removed = await deleteTransferContact(req.firmId!, id);
      if (!removed) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to delete transfer contact");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── POST /api/receptionist/voice/transfer-contacts/:id/test ───────────────────
//
// A preflight, named as one. It exercises the real resolver, so it catches the
// mistakes that actually happen — an inactive contact, missing consent, an
// hours window that excludes right now, a different contact winning the order —
// and it reports exactly what it verified and what it could not.

router.post(
  "/receptionist/voice/transfer-contacts/:id/test",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid contact id" });
      return;
    }
    try {
      const contact = await getTransferContact(req.firmId!, id);
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
      checks.push({
        name: "Contact is active",
        pass: contact.active,
        detail: contact.active ? "Active." : "This contact is switched off, so calls will never reach it.",
      });
      checks.push({
        name: "Authorization recorded",
        pass: contact.consentConfirmedAt !== null,
        detail:
          contact.consentConfirmedAt !== null
            ? "You confirmed this person agreed to receive transferred calls."
            : "Not confirmed. Nothing will be dialled until you confirm this person agreed to receive calls.",
      });

      // The real resolver, against live state, right now.
      const resolution = await resolveTransferDestination(req.firmId!);
      const wouldReachThisContact = resolution.ok && resolution.destinationId === contact.id;
      checks.push({
        name: "Available right now",
        pass: resolution.ok,
        detail: resolution.ok
          ? `A transfer requested now resolves to ${resolution.label}.`
          : resolution.reason === "after_hours"
            ? "Outside the configured hours, so a transfer now would not be attempted. The assistant takes a message instead."
            : resolution.reason === "no_consent"
              ? "No contact on your list has recorded authorization yet."
              : "No active transfer contact is configured.",
      });
      if (resolution.ok && !wouldReachThisContact) {
        checks.push({
          name: "Routing order",
          pass: false,
          detail: `Another contact (${resolution.label}) is ahead of this one. Make this contact the default, or lower its priority number, to reach it first.`,
        });
      }

      const numberAssigned = await hasAssignedNumber(req.firmId!);

      res.json({
        contact: serializeContact(contact),
        // Unambiguous: nothing was called.
        dialed: false,
        mode: numberAssigned ? "preflight_then_live_available" : "preflight_only",
        checks,
        readyToAttempt: checks.every((c) => c.pass),
        // Said plainly, because "the provider accepted the transfer request" is
        // not the same thing as "a person answered", and only the second one
        // matters to a business.
        limitation: numberAssigned
          ? "This check confirmed your settings. It did not ring anyone. A completed transfer with two-way audio can only be proven on a real phone call while the recipient is available."
          : "This check confirmed your settings. It did not ring anyone, and it cannot: a transfer needs a phone number for this business. Browser test calls stay in the browser.",
      });
    } catch (err) {
      req.log.error({ err, firmId: req.firmId }, "[receptionist] transfer contact preflight failed");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
