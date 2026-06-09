import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { bindShop, isShopEntitled } from "../lib/licensing.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Check for pending install in database (from install flow)
    const pendingInstall = await prisma.pendingInstall.findUnique({
      where: { shopDomain: shop },
    });

    if (pendingInstall) {
      // New install with license key - bind the shop
      const result = await bindShop({
        licenseKey: pendingInstall.licenseKey,
        shopDomain: shop,
      });

      // Delete the pending install record
      await prisma.pendingInstall.delete({
        where: { shopDomain: shop },
      });

      if (!result.success) {
        // Binding failed - log error (app.jsx will show inactive message)
        console.error(`Shop binding failed for ${shop}:`, result.error);
      } else {
        console.log(`Shop ${shop} bound to license ${pendingInstall.licenseKey}`);

        // Also update StoreSettings to mark as active
        await prisma.storeSettings.upsert({
          where: { shop },
          update: { isActive: true },
          create: { shop, isActive: true },
        });
      }
    } else {
      // No pending install - check if shop is already entitled
      const entitlement = await isShopEntitled({ shopDomain: shop });

      if (entitlement.entitled) {
        // Shop has valid license - ensure StoreSettings is active
        await prisma.storeSettings.upsert({
          where: { shop },
          update: { isActive: true },
          create: { shop, isActive: true },
        });
      }
      // If not entitled, app.jsx will show the inactive message
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
