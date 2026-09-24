import type { NextFunction, Request, Response } from "express";
import {
  OpenAiUnavailableError,
  OPENAI_UNAVAILABLE_CODE,
} from "@workspace/integrations-openai-ai-server";

/**
 * AR-001O — the single place the server turns "OpenAI is not configured" into
 * an HTTP answer.
 *
 * The integration itself is fail-closed and lazy (see
 * `lib/integrations-openai-ai-server/src/client.ts`): invoking an
 * OpenAI-dependent feature without configuration raises
 * `OpenAiUnavailableError` instead of issuing a request. Without this handler
 * that surfaced as a generic 500, which is both untruthful — the request is
 * not going to succeed on a retry — and unhelpful.
 *
 * It is registered once, after the router, rather than as a per-route
 * environment check, so no route needs to know which variables the integration
 * reads. The body is a fixed shape and never carries a value read from the
 * environment; the absent variable *names* go to the server log only.
 */

export const OPENAI_UNAVAILABLE_STATUS = 503;

export const OPENAI_UNAVAILABLE_BODY = {
  error: "AI features are not configured on this server",
  code: OPENAI_UNAVAILABLE_CODE,
} as const;

export function isOpenAiUnavailableError(
  err: unknown,
): err is OpenAiUnavailableError {
  return err instanceof OpenAiUnavailableError;
}

export function openAiUnavailableErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isOpenAiUnavailableError(err)) {
    next(err);
    return;
  }

  // Variable names only — never their contents.
  req.log?.error(
    { missing: err.missing },
    "Refused an OpenAI-dependent request: integration not configured",
  );

  // A streaming route may already have flushed its headers; leave those to the
  // default handler rather than attempting a second write of the status line.
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(OPENAI_UNAVAILABLE_STATUS).json(OPENAI_UNAVAILABLE_BODY);
}
