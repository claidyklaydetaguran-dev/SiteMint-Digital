import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db, aiToolkitPurchases } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CreateAiToolkitCheckoutResponse,
  GetAiToolkitPurchaseResponse,
} from "@workspace/api-zod";
import { getUncachableStripeClient } from "../lib/stripeClient.js";
import { sendAiToolkitDeliveryEmail } from "../lib/aiToolkitEmail.js";
import { AI_TOOLKIT_FILENAME, AI_TOOLKIT_MARKDOWN } from "../assets/smb-ai-toolkit-content.js";

const router: IRouter = Router();

const PRODUCT_SLUG = "smb-ai-toolkit";

function getBaseUrl(req: Request): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (domain) return `https://${domain}`;
  return `${req.protocol}://${req.get("host")}`;
}

async function findActivePriceIdForProduct(): Promise<string> {
  const result = await db.execute(
    sql`
      SELECT pr.id AS price_id
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true AND p.metadata ->> 'slug' = ${PRODUCT_SLUG}
      ORDER BY pr.unit_amount ASC
      LIMIT 1
    `,
  );
  const row = result.rows[0] as { price_id?: string } | undefined;
  if (!row?.price_id) {
    throw new Error(
      `No active Stripe price found for product with metadata.slug="${PRODUCT_SLUG}". Run the seed-ai-toolkit-product script.`,
    );
  }
  return row.price_id;
}

router.post("/ai-toolkit/checkout", async (req: Request, res: Response) => {
  try {
    const priceId = await findActivePriceIdForProduct();
    const stripe = await getUncachableStripeClient();
    const baseUrl = getBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/ai-toolkit/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/ai-toolkit/cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    const data = CreateAiToolkitCheckoutResponse.parse({ url: session.url });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to create AI toolkit checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/ai-toolkit/purchases/:sessionId", async (req: Request, res: Response) => {
  const sessionId = String(req.params["sessionId"]);

  try {
    const [existing] = await db
      .select()
      .from(aiToolkitPurchases)
      .where(eq(aiToolkitPurchases.stripeSessionId, sessionId));

    if (existing) {
      const data = GetAiToolkitPurchaseResponse.parse({
        found: true,
        delivered: existing.delivered,
        email: existing.email,
      });
      res.json(data);
      return;
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(String(sessionId));

    if (session.payment_status !== "paid") {
      const data = GetAiToolkitPurchaseResponse.parse({
        found: false,
        delivered: false,
        email: null,
      });
      res.json(data);
      return;
    }

    const email = session.customer_details?.email ?? session.customer_email ?? null;
    if (!email) {
      req.log.error({ sessionId }, "Paid AI toolkit checkout session has no email");
      res.status(500).json({ error: "Unable to determine purchaser email" });
      return;
    }

    const downloadToken = crypto.randomBytes(24).toString("hex");

    const [purchase] = await db
      .insert(aiToolkitPurchases)
      .values({
        email,
        stripeSessionId: sessionId,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        downloadToken,
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
        delivered: false,
      })
      .onConflictDoNothing({ target: aiToolkitPurchases.stripeSessionId })
      .returning();

    const record =
      purchase ??
      (
        await db
          .select()
          .from(aiToolkitPurchases)
          .where(eq(aiToolkitPurchases.stripeSessionId, sessionId))
      )[0];

    if (!record) {
      throw new Error("Failed to persist AI toolkit purchase record");
    }

    if (!record.delivered) {
      const baseUrl = getBaseUrl(req);
      try {
        await sendAiToolkitDeliveryEmail({
          to: record.email,
          downloadUrl: `${baseUrl}/api/ai-toolkit/download/${record.downloadToken}`,
        });
        await db
          .update(aiToolkitPurchases)
          .set({ delivered: true, deliveryError: null })
          .where(eq(aiToolkitPurchases.id, record.id));
        record.delivered = true;
      } catch (emailErr) {
        const message = emailErr instanceof Error ? emailErr.message : String(emailErr);
        req.log.error({ err: emailErr, sessionId }, "Failed to send AI toolkit delivery email");
        await db
          .update(aiToolkitPurchases)
          .set({ deliveryError: message })
          .where(eq(aiToolkitPurchases.id, record.id));
      }
    }

    const data = GetAiToolkitPurchaseResponse.parse({
      found: true,
      delivered: record.delivered,
      email: record.email,
    });
    res.json(data);
  } catch (err) {
    req.log.error({ err, sessionId }, "Failed to look up AI toolkit purchase");
    res.status(500).json({ error: "Failed to look up purchase" });
  }
});

router.get("/ai-toolkit/download/:token", async (req: Request, res: Response) => {
  const token = String(req.params["token"]);

  try {
    const [purchase] = await db
      .select()
      .from(aiToolkitPurchases)
      .where(eq(aiToolkitPurchases.downloadToken, token));

    if (!purchase) {
      res.status(404).send("Download link not found or has expired.");
      return;
    }

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${AI_TOOLKIT_FILENAME}"`);
    res.send(AI_TOOLKIT_MARKDOWN);
  } catch (err) {
    req.log.error({ err, token }, "Failed to serve AI toolkit download");
    res.status(500).send("Failed to serve download.");
  }
});

export default router;
