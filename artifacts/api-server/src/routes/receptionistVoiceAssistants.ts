// Milestone 1 / Checkpoint E1: authenticated, firm-scoped CRUD for persisted
// assistant drafts (voice_assistants). No provider is instantiated or
// called in this checkpoint, and the frontend is not connected.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { voiceAssistantService } from "../lib/voiceAssistants/service.js";
import { AssistantApiError } from "../lib/voiceAssistants/errors.js";

const router = Router();

// Only a safe error class name is logged for unexpected errors — never the
// raw error, its cause, message, stack, or any SQL/config/prompt content it
// may carry (e.g. driver errors can embed query text and parameters).
function safeErrorClassName(err: unknown): string {
  if (err instanceof Error) return err.constructor.name || "Error";
  return typeof err;
}

function handleError(
  req: Request,
  res: Response,
  err: unknown,
  operation: string,
  assistantId?: number | string,
): void {
  if (err instanceof AssistantApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  req.log.error(
    {
      operation,
      firmId: req.firmId,
      assistantId,
      category: "unexpected_internal_error",
      errorClass: safeErrorClassName(err),
    },
    "[receptionist] voice assistant request failed",
  );
  res.status(500).json({ error: "Internal server error" });
}

// ── GET /api/receptionist/voice/assistants ────────────────────────────────────

router.get(
  "/receptionist/voice/assistants",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const result = await voiceAssistantService.list(req.firmId!);
      res.json(result);
    } catch (err) {
      handleError(req, res, err, "list");
    }
  },
);

// ── POST /api/receptionist/voice/assistants ───────────────────────────────────

router.post(
  "/receptionist/voice/assistants",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const assistant = await voiceAssistantService.create(req.firmId!, req.body);
      req.log.info(
        { firmId: req.firmId, assistantId: assistant.id, operation: "create" },
        "[receptionist] voice assistant created",
      );
      res.status(201).json({ assistant });
    } catch (err) {
      handleError(req, res, err, "create");
    }
  },
);

// ── GET /api/receptionist/voice/assistants/:id ────────────────────────────────

router.get(
  "/receptionist/voice/assistants/:id",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const assistant = await voiceAssistantService.get(req.firmId!, req.params.id as string);
      res.json({ assistant });
    } catch (err) {
      handleError(req, res, err, "get", req.params.id as string);
    }
  },
);

// ── PATCH /api/receptionist/voice/assistants/:id ──────────────────────────────

router.patch(
  "/receptionist/voice/assistants/:id",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const assistant = await voiceAssistantService.update(
        req.firmId!,
        req.params.id as string,
        req.body,
      );
      req.log.info(
        { firmId: req.firmId, assistantId: assistant.id, operation: "update" },
        "[receptionist] voice assistant updated",
      );
      res.json({ assistant });
    } catch (err) {
      handleError(req, res, err, "update", req.params.id as string);
    }
  },
);

// ── POST /api/receptionist/voice/assistants/:id/duplicate ─────────────────────

router.post(
  "/receptionist/voice/assistants/:id/duplicate",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const assistant = await voiceAssistantService.duplicate(req.firmId!, req.params.id as string);
      req.log.info(
        { firmId: req.firmId, assistantId: assistant.id, operation: "duplicate" },
        "[receptionist] voice assistant duplicated",
      );
      res.status(201).json({ assistant });
    } catch (err) {
      handleError(req, res, err, "duplicate", req.params.id as string);
    }
  },
);

// ── DELETE /api/receptionist/voice/assistants/:id ─────────────────────────────

router.delete(
  "/receptionist/voice/assistants/:id",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      await voiceAssistantService.remove(req.firmId!, req.params.id as string);
      req.log.info(
        { firmId: req.firmId, assistantId: req.params.id, operation: "delete" },
        "[receptionist] voice assistant deleted",
      );
      res.status(204).send();
    } catch (err) {
      handleError(req, res, err, "delete", req.params.id as string);
    }
  },
);

export default router;
