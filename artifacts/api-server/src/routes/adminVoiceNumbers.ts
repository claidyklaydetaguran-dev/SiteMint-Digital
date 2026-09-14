// Platform-operator telephone inventory. Bearer-admin only, the same
// `validateToken` the other admin routes use.
//
// This is deliberately NOT on the customer surface. A business may read and
// manage the numbers it holds (`receptionistNumbers.ts`); it may never
// enumerate the organisation's stock or name a number it does not hold, which
// is why assignment takes a firm id and lives behind operator auth rather than
// taking the caller's own session as the target.
//
// Nothing here buys or imports a number. Acquisition remains the separate,
// owner-gated stop; this only hands out what the organisation already owns.

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";

import { validateToken } from "../lib/admin-session.js";
import { recordAuditEvent } from "../lib/voiceAccounts/auditLog.js";
import {
  assignNumberToFirm,
  productionAssignWrite,
  productionFindPublishedAssistantId,
  productionInventoryDeps,
  readInventory,
  releaseFirmNumber,
  type AssignDeps,
} from "../lib/voiceNumbers/inventoryService.js";
import type { VoicePhoneNumberRecord } from "../lib/voice/types.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!validateToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * Builds the provider-backed dependencies.
 *
 * The provider is constructed here, per request, for the same reason the
 * publish path does it: importing this module must not read the environment or
 * touch the network. A provider that cannot list numbers leaves
 * `listProviderNumbers` absent, and the service reports "unreadable" rather
 * than an empty organisation.
 */
async function buildDeps(): Promise<AssignDeps> {
  const { createProductionVoiceProvider } = await import("../lib/voicePublishing/providerFactory.js");
  const provider = createProductionVoiceProvider();
  const list = provider.listPhoneNumbers ? () => provider.listPhoneNumbers!() : undefined;

  const confirmProviderNumber = list
    ? async (providerNumberId: string): Promise<VoicePhoneNumberRecord | null> => {
        const all = await list();
        return all.find((n) => n.providerNumberId === providerNumberId) ?? null;
      }
    : undefined;

  return {
    ...productionInventoryDeps(list),
    findPublishedAssistantId: productionFindPublishedAssistantId,
    upsertAssignment: productionAssignWrite,
    ...(confirmProviderNumber ? { confirmProviderNumber } : {}),
  };
}

// ── GET /api/admin/voice/phone-numbers ───────────────────────────────────────
// Read-only. Answers the three questions a per-business list cannot: does this
// number exist, who owns it, and does the provider already route it somewhere.

router.get("/admin/voice/phone-numbers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await readInventory(await buildDeps());
    if (!result.ok) {
      res.status(503).json({ error: result.detail, reason: result.reason });
      return;
    }
    res.json({ items: result.entries, count: result.entries.length });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[admin numbers] inventory read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/admin/voice/phone-numbers/:providerNumberId/assign ─────────────

router.post("/admin/voice/phone-numbers/:providerNumberId/assign", requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { firmId?: unknown; takeOverProviderRouting?: unknown };
    const firmId = Number(body.firmId);
    const result = await assignNumberToFirm(
      {
        providerNumberId: String(req.params.providerNumberId ?? ""),
        firmId,
        takeOverProviderRouting: body.takeOverProviderRouting === true,
      },
      await buildDeps(),
    );

    if (!result.ok) {
      const status = result.reason === "inventory_unreadable" ? 503 : result.reason === "shape_rejected" ? 400 : 409;
      res.status(status).json({ error: result.detail, reason: result.reason });
      return;
    }

    await recordAuditEvent({
      actor: "admin",
      firmId,
      action: "voice_number_assign",
      // The telephone number is the point of the record; the provider id is not
      // echoed, matching how provider identifiers are treated everywhere else.
      context: { phoneE164: result.phoneE164, state: result.state },
    });

    res.json(
      result.state === "assigned"
        ? { ok: true, state: "assigned", phoneE164: result.phoneE164 }
        : { ok: true, state: "paused", phoneE164: result.phoneE164, pausedReason: result.pausedReason, detail: result.detail },
    );
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[admin numbers] assign failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/admin/voice/phone-numbers/:providerNumberId/release ────────────
// Recovery: returns a number to stock without touching the provider, so a
// half-finished or mistaken assignment can be undone without spending anything.

router.post("/admin/voice/phone-numbers/:providerNumberId/release", requireAdmin, async (req: Request, res: Response) => {
  try {
    const firmId = Number((req.body ?? {}).firmId);
    if (!Number.isInteger(firmId) || firmId <= 0) {
      res.status(400).json({ error: "A firm id is required." });
      return;
    }
    const released = await releaseFirmNumber(firmId, String(req.params.providerNumberId ?? ""));
    if (!released) {
      res.status(404).json({ error: "That business does not hold that number." });
      return;
    }
    await recordAuditEvent({ actor: "admin", firmId, action: "voice_number_release", context: {} });
    res.json({ ok: true, state: "inventory" });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[admin numbers] release failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
