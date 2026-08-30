// Milestone 1 / Checkpoint E1: authenticated, firm-scoped CRUD for persisted
// assistant drafts (voice_assistants). No provider is instantiated or
// called in this checkpoint, and the frontend is not connected.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { voiceAssistantService } from "../lib/voiceAssistants/service.js";
import { AssistantApiError } from "../lib/voiceAssistants/errors.js";
import { validateRouteId } from "../lib/voiceAssistants/validation.js";
import { publishAssistant } from "../lib/voicePublishing/publishService.js";
import { buildPublishRouteError, type PublishRouteError } from "../lib/voicePublishing/publishHttpErrors.js";
import { synchronizePublishedAssistant } from "../lib/voicePublishing/syncService.js";
import { buildSyncRouteError, type SyncRouteError } from "../lib/voicePublishing/syncErrors.js";
import {
  getBrowserTestSession,
  buildBrowserTestSessionError,
  type BrowserTestSessionError,
} from "../lib/voiceAssistants/browserTestSession.js";

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

// ── POST /api/receptionist/voice/assistants/:id/publish ───────────────────────
//
// Checkpoint E3B2: authenticated, firm-scoped publish orchestration. firmId
// comes only from req.firmId (the authenticated session) — never from the
// body, query string, URL parameter, or a header. The browser may not supply
// an attempt ID, provider, providerAssistantId, runtime values, or publish
// status; the request body must be absent or an empty plain object.

function sendPublishError(res: Response, error: PublishRouteError): void {
  res.status(error.status).json({
    error: { code: error.code, message: error.message, retryable: error.retryable },
  });
}

/** The publish body must be absent or `{}` — any key (including firmId, provider, attempt ID, etc.) is rejected. */
function assertEmptyPublishBody(body: unknown): void {
  if (body === undefined || body === null) return;
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new AssistantApiError("VALIDATION", "Request body must be empty or an empty object");
  }
  if (Object.keys(body as Record<string, unknown>).length > 0) {
    throw new AssistantApiError("VALIDATION", "Request body must not contain any fields");
  }
}

router.post(
  "/receptionist/voice/assistants/:id/publish",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    let assistantId: number;
    try {
      assertEmptyPublishBody(req.body);
      assistantId = validateRouteId(req.params.id as string);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        sendPublishError(res, buildPublishRouteError("invalid_request"));
        return;
      }
      req.log.error(
        { operation: "publish", firmId: req.firmId, category: "unexpected_internal_error", errorClass: safeErrorClassName(err) },
        "[receptionist] voice assistant publish request failed",
      );
      sendPublishError(res, buildPublishRouteError("internal_error"));
      return;
    }

    try {
      const result = await publishAssistant(req.firmId!, assistantId);
      if (result.ok) {
        res.status(200).json({ assistant: result.assistant });
        return;
      }
      sendPublishError(res, result.error);
    } catch (err) {
      req.log.error(
        {
          operation: "publish",
          firmId: req.firmId,
          assistantId,
          category: "unexpected_internal_error",
          errorClass: safeErrorClassName(err),
        },
        "[receptionist] voice assistant publish request failed",
      );
      sendPublishError(res, buildPublishRouteError("internal_error"));
    }
  },
);

// ── POST /api/receptionist/voice/assistants/:id/sync ──────────────────────────
// AR-001V. Same contract as publish: firmId comes only from the authenticated
// session, and the body must be absent or `{}` — the browser may not supply a
// provider, a providerAssistantId, an attempt id, a config, or a digest. The
// response carries no provider assistant id and no provider response.

function sendSyncError(res: Response, error: SyncRouteError): void {
  res.status(error.status).json({
    error: { code: error.code, message: error.message, retryable: error.retryable },
  });
}

router.post(
  "/receptionist/voice/assistants/:id/sync",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    let assistantId: number;
    try {
      assertEmptyPublishBody(req.body);
      assistantId = validateRouteId(req.params.id as string);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        sendSyncError(res, buildSyncRouteError("invalid_request"));
        return;
      }
      req.log.error(
        { operation: "sync", firmId: req.firmId, category: "unexpected_internal_error", errorClass: safeErrorClassName(err) },
        "[receptionist] voice assistant sync request failed",
      );
      sendSyncError(res, buildSyncRouteError("internal_error"));
      return;
    }

    try {
      const result = await synchronizePublishedAssistant(req.firmId!, assistantId);
      if (result.ok) {
        res.status(200).json({ assistant: result.assistant });
        return;
      }
      sendSyncError(res, result.error);
    } catch (err) {
      req.log.error(
        {
          operation: "sync",
          firmId: req.firmId,
          assistantId,
          category: "unexpected_internal_error",
          errorClass: safeErrorClassName(err),
        },
        "[receptionist] voice assistant sync request failed",
      );
      sendSyncError(res, buildSyncRouteError("internal_error"));
    }
  },
);

// ── GET /api/receptionist/voice/assistants/:id/browser-test-session ───────────
// AR-001V.1. The only endpoint that ever returns a provider assistant id, and
// it returns nothing else. The client calls it exactly once, after the owner
// confirms Start Browser Test — never on page load. It performs no provider
// request and constructs no provider client.

function sendBrowserTestSessionError(res: Response, error: BrowserTestSessionError): void {
  res.status(error.status).json({ error: { code: error.code, message: error.message } });
}

router.get(
  "/receptionist/voice/assistants/:id/browser-test-session",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    let assistantId: number;
    try {
      assistantId = validateRouteId(req.params.id as string);
    } catch {
      sendBrowserTestSessionError(res, buildBrowserTestSessionError("invalid_request"));
      return;
    }

    try {
      const result = await getBrowserTestSession(req.firmId!, assistantId);
      if (result.ok) {
        res.status(200).json({ session: result.session });
        return;
      }
      sendBrowserTestSessionError(res, result.error);
    } catch (err) {
      // Only the error class name is logged — never the row, the provider id,
      // the assistant config, or the raw error.
      req.log.error(
        {
          operation: "browser_test_session",
          firmId: req.firmId,
          assistantId,
          category: "unexpected_internal_error",
          errorClass: safeErrorClassName(err),
        },
        "[receptionist] voice assistant browser-test session request failed",
      );
      sendBrowserTestSessionError(res, buildBrowserTestSessionError("internal_error"));
    }
  },
);

export default router;
