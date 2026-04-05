import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLAN_NAME } from "../billing.server";

/**
 * Webhook handler for app_subscriptions/update
 *
 * Triggered when:
 * - Subscription is created/activated
 * - Subscription is cancelled
 * - Payment fails
 * - Subscription status changes
 *
 * This ensures billing status is always in sync, even if user
 * cancels from Shopify admin (not through our app).
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  if (!payload?.app_subscription) {
    console.log("WEBHOOK: No subscription data in payload", { shop, topic });
    return new Response();
  }

  const subscription = payload.app_subscription;
  const subscriptionName = subscription.name;
  const status = subscription.status;

  // Only process our plan
  if (subscriptionName !== PLAN_NAME) {
    console.log("WEBHOOK: Ignoring different plan", { shop, plan: subscriptionName });
    return new Response();
  }

  // Status values: ACTIVE, CANCELLED, DECLINED, EXPIRED, FROZEN, PENDING
  const isActive = status === "ACTIVE";

  console.log("WEBHOOK: Subscription update", {
    shop,
    status,
    id: subscription.admin_graphql_api_id
  });

  try {
    if (isActive) {
      // Subscription is active - ensure store is activated
      await prisma.storeSettings.upsert({
        where: { shop },
        update: {
          isActive: true,
          plan: "pro",
          billingId: subscription.admin_graphql_api_id || null
        },
        create: {
          shop,
          isActive: true,
          plan: "pro",
          billingId: subscription.admin_graphql_api_id || null
        }
      });
      console.log("WEBHOOK: Store activated via webhook", { shop });
    } else {
      // Subscription is no longer active - deactivate store
      // This handles: CANCELLED, DECLINED, EXPIRED, FROZEN
      await prisma.storeSettings.updateMany({
        where: { shop },
        data: {
          isActive: false,
          billingId: null
        }
      });
      console.log("WEBHOOK: Store deactivated via webhook", { shop, reason: status });
    }
  } catch (err) {
    console.error("WEBHOOK: Error processing subscription update", {
      shop,
      error: err.message
    });
  }

  return new Response();
};
