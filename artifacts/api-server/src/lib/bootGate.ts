// R6 — the middleware that keeps a bound-but-not-ready process from serving
// application traffic.
//
// Mounted at "/api" ahead of every route (including the app-level Stripe
// webhook and the raw-body parsers), so a blocked request is refused before
// authentication, body parsing, any database access and any outbound call.
//
// While `starting` it admits exactly two things — the liveness root and
// /healthz — because those are what the platform probe needs in order to keep
// the deployment alive while migrations run. Everything else, readiness
// included, gets a generic 503.
//
// While `failed` it admits nothing. Reporting "ok" from a process whose
// migrations failed would be a lie, and the boot sequence is closing the
// server and exiting non-zero at that point anyway.

import type { NextFunction, Request, Response } from "express";
import { getBootState } from "./bootState.js";

/** Generic, uninformative — it names no state, flag or internal detail. */
export const BOOT_UNAVAILABLE_MESSAGE = "The service is starting up. Please try again shortly.";

/** Paths (relative to the /api mount) served while the process is starting. */
const LIVENESS_PATHS = new Set(["/", "/healthz"]);

export function bootGate(req: Request, res: Response, next: NextFunction): void {
  const state = getBootState();
  if (state === "ready") {
    next();
    return;
  }

  if (state === "starting") {
    const path = req.path === "" ? "/" : req.path;
    const readOnly = req.method === "GET" || req.method === "HEAD";
    if (readOnly && LIVENESS_PATHS.has(path)) {
      next();
      return;
    }
  }

  res.status(503).json({ error: BOOT_UNAVAILABLE_MESSAGE });
}
