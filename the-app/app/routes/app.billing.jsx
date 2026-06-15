import { useLoaderData, Form, useNavigation } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLAN_NAME, PLAN_PRICE, IS_TEST_BILLING } from "../billing.server";

export const loader = async ({ request }) => {
  // Get shop from authenticated session (more reliable than URL params)
  const { session } = await authenticate.admin(request);
  const shop = session?.shop;
  const url = new URL(request.url);

  if (!shop) {
    return { shop: null, price: PLAN_PRICE, planName: PLAN_NAME };
  }

  // Check local DB - parent route already synced billing with Shopify
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
    select: { isActive: true }
  });

  // If already paid, redirect to main app
  if (settings?.isActive) {
    throw redirect(`/app${url.search}`);
  }

  return { shop, price: PLAN_PRICE, planName: PLAN_NAME };
};

export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);

  // Create Shopify billing subscription
  await billing.request({
    plan: PLAN_NAME,
    amount: PLAN_PRICE,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    isTest: IS_TEST_BILLING,
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback`
  });

  // billing.request automatically redirects to Shopify payment page
  // This return won't be reached
  return null;
};

export default function Billing() {
  const { shop, price, planName } = useLoaderData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Activate Nudge">
      <s-section>
        <s-box padding="loose" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base" style={{ textAlign: "center" }}>
            <s-text variant="headingXl">Start Converting Hesitant Shoppers</s-text>
            <s-text variant="bodyLg" tone="subdued">
              Nudge shows personalized discount banners at the perfect moment to convert browsers into buyers.
            </s-text>
          </s-stack>
        </s-box>
      </s-section>

      <s-section>
        <s-box padding="loose" borderWidth="base" borderRadius="base" style={{ maxWidth: 500, margin: "0 auto" }}>
          <s-stack direction="block" gap="loose">
            {/* Plan Details */}
            <s-stack direction="block" gap="tight" style={{ textAlign: "center" }}>
              <s-text variant="headingLg">{planName}</s-text>
              <s-stack direction="inline" gap="tight" style={{ justifyContent: "center", alignItems: "baseline" }}>
                <s-text variant="headingXl">${price}</s-text>
                <s-text variant="bodyMd" tone="subdued">/month</s-text>
              </s-stack>
            </s-stack>

            {/* Features */}
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-stack direction="inline" gap="tight">
                  <s-text>Behavioral hesitation detection</s-text>
                </s-stack>
                <s-stack direction="inline" gap="tight">
                  <s-text>AI-optimized timing & discounts</s-text>
                </s-stack>
                <s-stack direction="inline" gap="tight">
                  <s-text>Auto-expiring discount codes</s-text>
                </s-stack>
                <s-stack direction="inline" gap="tight">
                  <s-text>Built-in A/B testing</s-text>
                </s-stack>
                <s-stack direction="inline" gap="tight">
                  <s-text>Per-product & collection rules</s-text>
                </s-stack>
                <s-stack direction="inline" gap="tight">
                  <s-text>Detailed conversion analytics</s-text>
                </s-stack>
                <s-stack direction="inline" gap="tight">
                  <s-text>Customizable banner position & size</s-text>
                </s-stack>
              </s-stack>
            </s-box>

            {/* Subscribe Button */}
            <Form method="post">
              <s-button variant="primary" size="large" fullWidth disabled={isSubmitting}>
                {isSubmitting ? "Redirecting to payment..." : `Start ${planName} - $${price}/month`}
              </s-button>
            </Form>

            <s-text variant="bodySmall" tone="subdued" style={{ textAlign: "center" }}>
              Cancel anytime from your Shopify admin. No long-term commitment.
            </s-text>
          </s-stack>
        </s-box>
      </s-section>

      {/* How it Works Summary */}
      <s-section heading="How Nudge Works">
        <s-stack direction="inline" gap="loose">
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: "center" }}>
            <s-text variant="headingLg">1</s-text>
            <s-text variant="bodySmall">Shopper hesitates on product page</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: "center" }}>
            <s-text variant="headingLg">2</s-text>
            <s-text variant="bodySmall">AI detects hesitation pattern</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: "center" }}>
            <s-text variant="headingLg">3</s-text>
            <s-text variant="bodySmall">Personalized discount shown</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, textAlign: "center" }}>
            <s-text variant="headingLg">4</s-text>
            <s-text variant="bodySmall">Conversion!</s-text>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

