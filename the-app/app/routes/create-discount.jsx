import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// In-memory config (shared with get-config and save-config)
if (!global.STORE_CONFIG) {
  global.STORE_CONFIG = {};
}

export async function loader({ request }) {
  // App proxy requests use authenticate.public.appProxy
  const { admin, session } = await authenticate.public.appProxy(request);

  if (!admin) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || session?.shop;

  // Get discount value from config (default 10%)
  const config = global.STORE_CONFIG[shop] || { discount: 10 };
  const discountValue = config.discount || 10;
  const discountDecimal = discountValue / 100; // Convert 10 to 0.1

  const code = "NUDGE_" + Math.random().toString(36).substring(2, 8).toUpperCase();

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

    return json({ code });

  } catch (err) {
    console.error("CREATE-DISCOUNT ERROR:", err);
    return json({ error: "failed" }, { status: 500 });
  }
}

// Also handle POST requests
export const action = loader;
