// V5 PR-5: read-only, firm-scoped caller directory. Every response is
// derived from lib/voiceContacts/contactsQuery.ts, which always filters by
// req.firmId — a contact id belonging to another firm resolves to
// undefined and this route answers 404, never a cross-firm leak. No writes
// happen anywhere in this file.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { listContactsForFirm, getContactDetailForFirm } from "../lib/voiceContacts/contactsQuery.js";

const router = Router();

// ── GET /api/receptionist/contacts ────────────────────────────────────────────

router.get("/receptionist/contacts", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const query = typeof req.query["query"] === "string" ? (req.query["query"] as string) : undefined;
    const limitRaw = req.query["limit"];
    const limit = typeof limitRaw === "string" && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;
    const items = await listContactsForFirm(req.firmId!, query, limit);
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

export default router;
