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

  // Validate sessionId (prevent DB pollution from random strings)
  if (sessionId && sessionId.length > 64) {
    return json({ error: "Invalid session" }, { status: 400 });
  }

  // Validate productId format (must be digits only)
  if (productId && !/^\d+$/.test(productId)) {
    return json({ error: "Invalid productId" }, { status: 400 });
  }

  // Rate limiting: max 20 discounts per shop per minute (prevent spam)
  const recentCount = await prisma.discountCode.count({
    where: {
      shop,
      createdAt: { gte: new Date(Date.now() - 60 * 1000) }
    }
  });
  if (recentCount > 20) {
    console.warn("⚠️ RATE LIMIT:", { shop, recentCount });
    return json({ error: "rate limit" }, { status: 429 });
  }

  // Check for existing discount for this session (prevent spam/duplicate creation)
  if (sessionId) {
    const existing = await prisma.discountCode.findFirst({
      where: { sessionId, shop }
    });
    if (existing) {
      console.log("🔥 CREATE-DISCOUNT: Returning existing code for session", { code: existing.code, sessionId });
      return json({ code: existing.code });
    }
  }

  // Parse delay with strict Number (not parseInt which accepts "10abc")
  const delayParam = url.searchParams.get("delay");
  const delay = Number.isFinite(Number(delayParam)) ? Math.round(Number(delayParam)) : null;

  // CRITICAL FIX: Use the discount value from the request (what optimizer/override decided)
  // NOT the store default - the storefront already received the optimized value from get-config
  const requestDiscount = url.searchParams.get("discount");

  // Get store settings for validation bounds only
  const storeSettings = await prisma.storeSettings.findUnique({
    where: { shop }
  });

  // Use request discount if provided AND valid, otherwise fall back to store default
  // Use strict Number parsing (parseInt("10abc") = 10, but Number("10abc") = NaN)
  const parsed = Number(requestDiscount);
  const rawDiscount = Number.isFinite(parsed)
    ? Math.round(parsed)  // Ensure integer
    : (storeSettings?.discount || 10);

  // SECURITY: Validate within store bounds - NEVER trust frontend input
  const minDiscount = storeSettings?.minDiscount || 5;
  const maxDiscount = storeSettings?.maxDiscount || 30;
  const discountValue = Math.max(minDiscount, Math.min(maxDiscount, rawDiscount));

  // Log if clamped (potential abuse attempt or bug)
  if (rawDiscount !== discountValue) {
    console.warn("⚠️ DISCOUNT CLAMPED:", { requested: rawDiscount, applied: discountValue, min: minDiscount, max: maxDiscount, shop });
  }

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
          appliesOncePerCustomer: true, // Prevent same customer using multiple codes
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
    // Use upsert to handle race conditions (two parallel requests for same session)
    if (sessionId) {
      const record = await prisma.discountCode.upsert({
        where: {
          shop_sessionId: { shop, sessionId }
        },
        update: {}, // If exists, don't change anything - return existing
        create: {
          code,
          sessionId,
          shop,
          triggerType: triggerType || null,
          productId: productId || null,
          discount: discountValue,
          delay: delay || null,
          expiresAt,
          usageLimit: 1
        }
      });
      // If upsert returned existing record (race condition lost), return that code instead
      if (record.code !== code) {
        console.log("🔥 CREATE-DISCOUNT: Race condition - returning existing code", { existing: record.code, attempted: code });
        return json({ code: record.code });
      }
      console.log("📊 DISCOUNT CREATED for conversion tracking:", { code, sessionId, triggerType, delay, expiresAt });
    }

    return json({ code });

  } catch (err) {
    console.error("CREATE-DISCOUNT ERROR:", err);
    return json({ error: "failed" }, { status: 500 });
  }
}

// Also handle POST requests
export const action = loader;
