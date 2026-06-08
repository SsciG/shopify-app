import { boundary } from "@shopify/shopify-app-react-router/server";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getUser } from "../auth.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Check if there's a logged-in Coupon Pulse user (from website flow)
    const user = await getUser(request);

    if (user) {
      // Website flow: user came from dashboard with active subscription
      const subscription = user.subscription;

      // Verify subscription is active
      if (!subscription || subscription.status !== "active") {
        return redirect("/dashboard?error=subscription_required");
      }

      // Count active stores for this user
      const activeStoreCount = await prisma.userStore.count({
        where: {
          userId: user.id,
          status: { in: ["active", "pending"] },
        },
      });

      // Check store limit
      const storeLimit = subscription.storeLimit || 1;
      if (activeStoreCount >= storeLimit) {
        // Check if this specific shop is already linked to this user
        const existingStore = await prisma.userStore.findUnique({
          where: { shop },
        });

        if (!existingStore || existingStore.userId !== user.id) {
          return redirect("/dashboard?error=store_limit_reached");
        }
      }

      // Create or update UserStore record
      await prisma.userStore.upsert({
        where: { shop },
        update: {
          userId: user.id,
          status: "active",
          installedAt: new Date(),
          uninstalledAt: null,
          removedByUserAt: null,
        },
        create: {
          userId: user.id,
          shop,
          status: "active",
          installedAt: new Date(),
        },
      });

      // Also activate StoreSettings for this shop
      await prisma.storeSettings.upsert({
        where: { shop },
        update: {
          isActive: true,
        },
        create: {
          shop,
          isActive: true,
        },
      });
    }

    return null;
  } catch (response) {
    if (response instanceof Response) {
      const location = response.headers.get("Location");
      if (location) {
        response.headers.set("X-Shopify-API-Request-Failure-Reauthorize", "1");
        response.headers.set("X-Shopify-API-Request-Failure-Reauthorize-Url", location);
      }
    }
    throw response;
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
