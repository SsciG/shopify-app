import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  console.log("🔥 CREATE-DISCOUNT route hit");

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }

  // Use unauthenticated.admin to get admin API access via stored offline session
  let admin;
  try {
    const result = await unauthenticated.admin(shop);
    admin = result.admin;
    console.log("🔥 CREATE-DISCOUNT: Got admin via unauthenticated.admin");
  } catch (err) {
    console.error("🔥 CREATE-DISCOUNT: Failed to get admin:", err.message);
    return json({ error: "No session for shop - please reinstall app" }, { status: 401 });
  }

  if (!admin) {
    console.log("🔥 CREATE-DISCOUNT: No admin - unauthorized");
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionId = url.searchParams.get("sessionId");
  const triggerType = url.searchParams.get("triggerType");
  const productId = url.searchParams.get("productId");

  // Get discount value from database (single source of truth)
  const storeSettings = await prisma.storeSettings.findUnique({
    where: { shop }
  });
  const discountValue = storeSettings?.discount || 10;
  const discountDecimal = discountValue / 100; // Convert 10 to 0.1

  const code = "NUDGE_" + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Expiry: 15 minutes from now
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  console.log("🔥 CREATE-DISCOUNT", { shop, discountValue, code });

  try {
    const response = await admin.graphql(`
      mutation discountCodeBasicCreate($input: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $input) {
          codeDiscountNode {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          title: code,
          code: code,
          startsAt: new Date().toISOString(),
          endsAt: expiresAt.toISOString(), // Expires in 15 minutes
          usageLimit: 1, // Single use only
          combinesWith: {
            orderDiscounts: false,
            productDiscounts: false,
            shippingDiscounts: false
          },
          customerGets: {
            value: { percentage: discountDecimal },
            items: { all: true }
          },
          customerSelection: { all: true }
        }
      }
    });

    const data = await response.json();

    if (data.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      console.log("Shopify error:", data.data.discountCodeBasicCreate.userErrors);
      return json({ error: "failed", details: data.data.discountCodeBasicCreate.userErrors }, { status: 500 });
    }

    // Store discount code for conversion tracking
    if (sessionId) {
      await prisma.discountCode.create({
        data: {
          code,
          sessionId,
          shop,
          triggerType: triggerType || null,
          productId: productId || null,
          discount: discountValue,
          expiresAt,
          usageLimit: 1
        }
      });
      console.log("📊 DISCOUNT CREATED for conversion tracking:", { code, sessionId, triggerType, expiresAt });
    }

    return json({ code });

  } catch (err) {
    console.error("CREATE-DISCOUNT ERROR:", err);
    return json({ error: "failed" }, { status: 500 });
  }
}

// Also handle POST requests
export const action = loader;
