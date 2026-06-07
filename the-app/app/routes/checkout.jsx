import { redirect } from "react-router";
import { requireUser } from "../auth.server";

const VARIANT_IDS = {
  starter: process.env.LEMONSQUEEZY_STARTER_VARIANT_ID,
  pro: process.env.LEMONSQUEEZY_PRO_VARIANT_ID,
  enterprise: process.env.LEMONSQUEEZY_ENTERPRISE_VARIANT_ID,
};

export const loader = async ({ request }) => {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") || user.subscription?.plan || "starter";

  const variantId = VARIANT_IDS[plan];
  if (!variantId) {
    throw new Response("Invalid plan", { status: 400 });
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const appUrl = process.env.APP_URL || "https://couponpulse.co";

  if (!storeId || !apiKey) {
    throw new Response("Payment not configured", { status: 500 });
  }

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      "Accept": "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            custom: {
              user_id: user.id,
              plan: plan,
            },
          },
          product_options: {
            redirect_url: `${appUrl}/dashboard?checkout=success`,
          },
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: storeId,
            },
          },
          variant: {
            data: {
              type: "variants",
              id: variantId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("LemonSqueezy checkout error:", error);
    throw new Response("Failed to create checkout", { status: 500 });
  }

  const data = await response.json();
  const checkoutUrl = data.data.attributes.url;

  return redirect(checkoutUrl);
};

export default function Checkout() {
  return null;
}
