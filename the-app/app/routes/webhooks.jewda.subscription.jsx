import crypto from "crypto";
import { setLicenseStatus } from "../lib/licensing.server";
import prisma from "../db.server";

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
  const topic = request.headers.get("x-shopify-topic");
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

  let data;
  try {
    data = JSON.parse(payload);
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return new Response("Invalid payload", { status: 400 });
  }

  console.log(`jewda subscription webhook: ${topic}`, data.id);

  // Handle different subscription events
  // Note: Exact topic names depend on Shopify API version
  // These are the common subscription contract events

  try {
    switch (topic) {
      case "subscription_billing_attempts/success": {
        // Payment succeeded - keep license active
        const contractId = String(data.subscription_contract?.id || data.id);
        await setLicenseStatus({ jewdaSubId: contractId, status: "active" });
        console.log(`Subscription renewed: ${contractId}`);
        break;
      }

      case "subscription_billing_attempts/failure": {
        // Payment failed - mark as past_due
        const contractId = String(data.subscription_contract?.id || data.id);
        await setLicenseStatus({ jewdaSubId: contractId, status: "past_due" });
        console.log(`Subscription payment failed: ${contractId}`);
        break;
      }

      case "subscription_contracts/update": {
        // Contract updated - check status
        const contractId = String(data.id);
        const status = data.status?.toLowerCase();

        if (status === "cancelled" || status === "expired") {
          await setLicenseStatus({ jewdaSubId: contractId, status: "canceled" });
          console.log(`Subscription canceled/expired: ${contractId}`);
        } else if (status === "active") {
          await setLicenseStatus({ jewdaSubId: contractId, status: "active" });
          console.log(`Subscription reactivated: ${contractId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled subscription event: ${topic}`);
    }
  } catch (err) {
    console.error(`Error processing subscription webhook:`, err);
    return new Response("Processing error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
};

export const loader = async () => {
  return new Response("jewda subscription webhook endpoint", { status: 200 });
};
