import { getUncachableStripeClient } from "./stripeClient.js";

const PRODUCT_SLUG = "smb-ai-toolkit";
const PRODUCT_NAME = "SMB AI Toolkit";
const UNIT_AMOUNT = 2700;
const CURRENCY = "usd";

async function main() {
  const stripe = await getUncachableStripeClient();

  console.log("Checking for existing SMB AI Toolkit product...");

  const existingProducts = await stripe.products.search({
    query: `metadata['slug']:'${PRODUCT_SLUG}' AND active:'true'`,
  });

  let product = existingProducts.data[0];

  if (product) {
    console.log(`Found existing product: ${product.name} (${product.id})`);
  } else {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        "50+ ready-to-use AI prompts for marketing, sales, customer service, operations, and finance -- built for small business owners who want practical results from ChatGPT, Claude, or Gemini without the learning curve.",
      metadata: { slug: PRODUCT_SLUG },
    });
    console.log(`Created product: ${product.name} (${product.id})`);
  }

  const existingPrices = await stripe.prices.list({ product: product.id, active: true });
  const matchingPrice = existingPrices.data.find(
    (p) => p.unit_amount === UNIT_AMOUNT && p.currency === CURRENCY && !p.recurring,
  );

  if (matchingPrice) {
    console.log(`Found existing price: $${UNIT_AMOUNT / 100} (${matchingPrice.id})`);
  } else {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: UNIT_AMOUNT,
      currency: CURRENCY,
    });
    console.log(`Created price: $${UNIT_AMOUNT / 100} (${price.id})`);
  }

  console.log("Done. Stripe webhook sync will mirror this into the local stripe.* tables shortly.");
}

main().catch((error) => {
  console.error("Failed to seed AI toolkit product:", error);
  process.exit(1);
});
