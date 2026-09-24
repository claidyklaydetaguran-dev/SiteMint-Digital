// Firm-scoped contact directory. Reads come from
// lib/voiceContacts/contactsQuery.ts and hand edits from contactWrites.ts;
// both always filter by req.firmId, so a contact id belonging to another firm
// resolves to nothing and this route answers 404, never a cross-firm leak.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { listContactsForFirm, getContactDetailForFirm } from "../lib/voiceContacts/contactsQuery.js";
import { createManualContact, updateContact } from "../lib/voiceContacts/contactWrites.js";

const router = Router();

// ── GET /api/receptionist/contacts ────────────────────────────────────────────

router.get("/receptionist/contacts", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const query = typeof req.query["query"] === "string" ? (req.query["query"] as string) : undefined;
    const limitRaw = req.query["limit"];
    const limit = typeof limitRaw === "string" && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;
    // `callId` narrows to the contact linked to one call, through the
    // firm-scoped link row. A call id from another firm matches nothing.
    const callId = typeof req.query["callId"] === "string" ? (req.query["callId"] as string) : undefined;
    const items = await listContactsForFirm(req.firmId!, query, limit, callId);
    res.json({ items, count: items.length });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[contacts] list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/receptionist/contacts/:id ────────────────────────────────────────

router.get("/receptionist/contacts/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid contact id." });
    return;
  }
  try {
    const result = await getContactDetailForFirm(req.firmId!, id);
    if (!result) {
      res.status(404).json({ error: "Contact not found." });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[contacts] detail failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/receptionist/contacts/:id/texts ─────────────────────────────────
// J4: the texts between the business's voice number and this contact, oldest
// first, with each outbound text's send and delivery state. Firm-scoped
// through the contact: another firm's contact id is a 404.

router.get("/receptionist/contacts/:id/texts", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid contact id." });
    return;
  }
  try {
    const detail = await getContactDetailForFirm(req.firmId!, id);
    if (!detail) {
      res.status(404).json({ error: "Contact not found." });
      return;
    }
    const { listTextThread } = await import("../lib/voiceSms/textThread.js");
    const items = await listTextThread(req.firmId!, detail.contact.phone);
    res.json({ items, count: items.length, unread: items.filter((m) => m.unread).length });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[contacts] texts failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/contacts/:id/texts/read ───────────────────────────

router.post("/receptionist/contacts/:id/texts/read", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid contact id." });
    return;
  }
  try {
    const detail = await getContactDetailForFirm(req.firmId!, id);
    if (!detail) {
      res.status(404).json({ error: "Contact not found." });
      return;
    }
    const { markTextThreadRead } = await import("../lib/voiceSms/textThread.js");
    res.json({ ok: true, marked: await markTextThreadRead(req.firmId!, detail.contact.phone) });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[contacts] mark texts read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/contacts ───────────────────────────────────────────

router.post("/receptionist/contacts", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const result = await createManualContact(req.firmId!, (req.body ?? {}) as Record<string, unknown>);
    if (!result.ok) {
      if (result.reason === "exists") {
        res.status(409).json({ error: "A contact with that phone number already exists.", code: "exists" });
        return;
      }
      res.status(400).json({ error: result.errors[0]?.message ?? "Check the details.", errors: result.errors });
      return;
    }
    const detail = await getContactDetailForFirm(req.firmId!, result.id);
    res.status(201).json(detail);
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown", firmId: req.firmId }, "[contacts] create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PATCH /api/receptionist/contacts/:id ──────────────────────────────────────

router.patch("/receptionist/contacts/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid contact id." });
    return;
  }
  try {
    const result = await updateContact(req.firmId!, id, (req.body ?? {}) as Record<string, unknown>);
    if (!result.ok) {
      if (result.reason === "not_found") {
        res.status(404).json({ error: "Contact not found." });
        return;
      }
      res.status(400).json({ error: result.errors[0]?.message ?? "Check the details.", errors: result.errors });
      return;
    }
    const detail = await getContactDetailForFirm(req.firmId!, result.id);
    res.json(detail);
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown", firmId: req.firmId }, "[contacts] update failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
