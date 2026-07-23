import type { NextFunction, Request, Response } from "express";

/**
 * Extracted from app.ts so the exact body-size-limit contract for
 * POST /api/v1/discovery-submissions is independently testable with a
 * minimal standalone Express app — never the full application (which
 * transitively requires `DATABASE_URL` via other routers' top-level
 * `@workspace/db` imports) and never a real database.
 */
export const DISCOVERY_V1_BODY_LIMIT = "64kb";
export const DISCOVERY_V1_PATH = "/api/v1/discovery-submissions";

/**
 * Translates body-parser's own thrown errors (from the route-scoped
 * `express.json({ limit: DISCOVERY_V1_BODY_LIMIT })` registered ahead of
 * this handler) into this endpoint's stable, safe response shapes —
 * never Express's default error page, never the parser's internal error
 * text/stack. `entity.too.large` fires when the actual byte count read
 * from the request stream (not a trusted `Content-Length` header) exceeds
 * the limit — this correctly covers a missing or incorrect
 * `Content-Length`, chunked transfer encoding, and gzip/deflate-
 * decompressed size, because body-parser counts real bytes as they
 * stream in and (for `inflate: true`, the default) counts the
 * decompressed bytes, not the compressed wire size.
 */
export function discoveryV1BodyLimitErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  const e = err as { type?: string; status?: number } | undefined;
  if (e?.type === "entity.too.large" || e?.status === 413) {
    res.status(413).json({ code: "payload_too_large", message: "Request body is too large." });
    return;
  }
  if (e?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    res.status(400).json({ code: "malformed_request", message: "Request body could not be parsed." });
    return;
  }
  next(err);
}
