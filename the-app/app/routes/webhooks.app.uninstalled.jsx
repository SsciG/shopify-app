import { authenticate } from "../shopify.server";
import db from "../db.server";
import prisma from "../db.server";
import { releaseShop } from "../lib/licensing.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Release the shop slot in the licensing system (frees a slot for another store)
  try {
    const result = await releaseShop({ shopDomain: shop });
    if (result.success) {
      console.log(`[UNINSTALL] Released license slot for: ${shop}`);
    } else {
      console.log(`[UNINSTALL] No license binding found for: ${shop}`);
    }
  } catch (err) {
    console.log(`[UNINSTALL] Error releasing license slot for ${shop}:`, err.message);
  }

  // Mark shop as uninstalled in StoreSettings
  try {
    await prisma.storeSettings.update({
      where: { shop },
      data: {
        isActive: false,
        billingId: null,
        extensionNotes: `Uninstalled on ${new Date().toLocaleDateString()}`
      }
    });
    console.log(`[UNINSTALL] Deactivated shop: ${shop}`);
  } catch (err) {
    // Shop might not exist in settings yet
    console.log(`[UNINSTALL] Could not update settings for ${shop}:`, err.message);
  }

  return new Response();
};
