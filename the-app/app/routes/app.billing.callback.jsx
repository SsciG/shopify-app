import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLAN_NAME, IS_TEST_BILLING } from "../billing.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  // Check if payment was successful
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PLAN_NAME],
      isTest: IS_TEST_BILLING
    });

    if (hasActivePayment) {
      // IMPORTANT: Match subscription by plan name, not just first one
      // This prevents issues when multiple plans exist
      const subscription = appSubscriptions?.find(s => s.name === PLAN_NAME);
      const billingId = subscription?.id || null;

      // Activate the store
      await prisma.storeSettings.upsert({
        where: { shop },
        update: {
          isActive: true,
          plan: "pro",
          billingId
        },
        create: {
          shop,
          isActive: true,
          plan: "pro",
          billingId
        }
      });

      console.log("BILLING: Store activated", { shop, billingId });

      // Redirect to main app
      throw redirect("/app");
    }
  } catch (err) {
    if (err.message?.includes("redirect") || err.status === 302) {
      throw err;
    }
    console.error("BILLING CALLBACK ERROR:", err.message);
  }

  // Payment failed or was cancelled - redirect back to billing page
  console.log("BILLING: Payment not completed", { shop });
  throw redirect("/app/billing");
};
