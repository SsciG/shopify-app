import { authenticate } from "../shopify.server";
import db from "../db.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
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
