import crypto from "crypto";
import prisma from "../db.server";

const PLAN_LIMITS = {
  starter: 1,
  pro: 5,
  enterprise: 10,
};

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = request.headers.get("x-signature");
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error("Missing signature or webhook secret");
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await request.text();

  try {
    const isValid = verifySignature(payload, signature, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }
  } catch (err) {
    console.error("Signature verification error:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return new Response("Invalid payload", { status: 400 });
  }

  const eventName = event.meta?.event_name;
  const customData = event.meta?.custom_data || {};
  const subscriptionData = event.data?.attributes;

  const userId = customData.user_id;
  const plan = customData.plan || "starter";

  console.log(`LemonSqueezy webhook: ${eventName}`, { userId, plan });

  if (!userId) {
    console.error("Missing user_id in custom data");
    return new Response("Missing user_id", { status: 400 });
  }

  const lemonSqueezyCustomerId = String(subscriptionData?.customer_id || "");
  const lemonSqueezySubscriptionId = String(event.data?.id || "");
  const lemonSqueezyVariantId = String(subscriptionData?.variant_id || "");
  const lsStatus = subscriptionData?.status;

  let status = "inactive";
  switch (lsStatus) {
    case "active":
    case "trialing":
      status = "active";
      break;
    case "cancelled":
      status = "cancelled";
      break;
    case "expired":
      status = "expired";
      break;
    case "past_due":
    case "unpaid":
    case "paused":
      status = "past_due";
      break;
    default:
      status = "inactive";
  }

  const renewsAt = subscriptionData?.renews_at ? new Date(subscriptionData.renews_at) : null;
  const endsAt = subscriptionData?.ends_at ? new Date(subscriptionData.ends_at) : null;

  try {
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_payment_success": {
        await prisma.userSubscription.update({
          where: { userId },
          data: {
            status,
            plan,
            storeLimit: PLAN_LIMITS[plan] || 1,
            lemonSqueezyCustomerId,
            lemonSqueezySubscriptionId,
            lemonSqueezyVariantId,
            renewsAt,
            endsAt,
          },
        });
        console.log(`Subscription updated for user ${userId}: ${status}`);
        break;
      }

      case "subscription_cancelled": {
        await prisma.userSubscription.update({
          where: { userId },
          data: {
            status: "cancelled",
            endsAt,
          },
        });
        console.log(`Subscription cancelled for user ${userId}`);
        break;
      }

      case "subscription_expired": {
        await prisma.userSubscription.update({
          where: { userId },
          data: {
            status: "expired",
            endsAt: endsAt || new Date(),
          },
        });
        console.log(`Subscription expired for user ${userId}`);
        break;
      }

      case "subscription_payment_failed": {
        await prisma.userSubscription.update({
          where: { userId },
          data: {
            status: "past_due",
          },
        });
        console.log(`Payment failed for user ${userId}`);
        break;
      }

      default:
        console.log(`Unhandled event: ${eventName}`);
    }
  } catch (err) {
    console.error(`Error processing webhook for user ${userId}:`, err);
    return new Response("Processing error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
};

export const loader = async () => {
  return new Response("Webhook endpoint", { status: 200 });
};
