import crypto from "crypto";
import { createLicense } from "../lib/licensing.server";
import { getPlanByVariantId } from "../lib/plans";

// Verify Shopify webhook HMAC
function verifyWebhook(payload, hmacHeader, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(payload, "utf8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(digest));
}

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const webhookSecret = process.env.JEWDA_WEBHOOK_SECRET;

  if (!hmacHeader || !webhookSecret) {
    console.error("Missing HMAC header or webhook secret");
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await request.text();

  try {
    const isValid = verifyWebhook(payload, hmacHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }
  } catch (err) {
    console.error("Signature verification error:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  let order;
  try {
    order = JSON.parse(payload);
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return new Response("Invalid payload", { status: 400 });
  }

  console.log("jewda order received:", order.id, order.email);

  // Extract the variant ID from line items
  const lineItem = order.line_items?.[0];
  if (!lineItem) {
    console.error("No line items in order");
    return new Response("No line items", { status: 400 });
  }

  const variantId = String(lineItem.variant_id);
  const plan = getPlanByVariantId(variantId);

  if (!plan) {
    console.error("Unknown variant ID:", variantId);
    return new Response("Unknown variant", { status: 400 });
  }

  const email = order.email || order.customer?.email;
  if (!email) {
    console.error("No email in order");
    return new Response("No email", { status: 400 });
  }

  // Extract subscription contract ID if available (for recurring billing)
  // This comes from the selling plan allocation
  const sellingPlanAllocation = lineItem.selling_plan_allocation;
  const jewdaSubId = sellingPlanAllocation?.selling_plan?.id || null;

  try {
    const { license, created } = await createLicense({
      email,
      plan: plan.name,
      jewdaOrderId: String(order.id),
      jewdaSubId: jewdaSubId ? String(jewdaSubId) : null,
    });

    if (created) {
      console.log(`License created: ${license.key} for ${email} (${plan.name})`);
    } else {
      console.log(`License already exists for order ${order.id}`);
    }

    // The license key will be shown on the thank-you page via order attributes
    // or the customer can find it in their order confirmation
    // For now, we log it - later we can add email sending

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error creating license:", err);
    return new Response("Processing error", { status: 500 });
  }
};

export const loader = async () => {
  return new Response("jewda webhook endpoint", { status: 200 });
};
