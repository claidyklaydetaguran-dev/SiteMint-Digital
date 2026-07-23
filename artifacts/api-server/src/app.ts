import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { DISCOVERY_V1_BODY_LIMIT, DISCOVERY_V1_PATH, discoveryV1BodyLimitErrorHandler } from "./lib/discoveryV1BodyLimit.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// Register Stripe webhook route BEFORE express.json() -- it needs the raw Buffer body
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err) {
      req.log.error({ err }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

// Capture raw body for Resend webhook sig verification BEFORE json() runs
app.use("/api/crm/webhooks/resend", express.raw({ type: "application/json" }));

// Capture raw body for receptionist Stripe billing webhook BEFORE json() runs
app.use("/api/receptionist/billing/webhook", express.raw({ type: "application/json" }));

// Discovery v1 (structured submissions): explicit 64KB body-size cap,
// tighter than the global default below and enforced by the parser itself
// (actual bytes streamed, not a trusted Content-Length header — also
// correctly bounds chunked-encoded and gzip/deflate-decompressed bodies).
// Registered before the global express.json() so this path's request
// stream is fully consumed here; the global parser's own body-parser guard
// (`if (req._body) return next()`) skips re-parsing for this path. See
// lib/discoveryV1BodyLimit.ts (independently unit-tested with a minimal
// standalone Express app — no full app, no database) for the shared
// constants and the error-translation handler registered right after.
app.use(DISCOVERY_V1_PATH, express.json({ limit: DISCOVERY_V1_BODY_LIMIT }));
app.use(DISCOVERY_V1_PATH, discoveryV1BodyLimitErrorHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
