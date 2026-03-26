import { useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  // Check current subscription status
  let currentPlan = "free";
  let hasActiveSubscription = false;
  const isTestMode = process.env.NODE_ENV !== "production";

  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: ["Starter", "Pro"],
      isTest: isTestMode
    });
    hasActiveSubscription = hasActivePayment;
    if (hasActivePayment && appSubscriptions?.length > 0) {
      // Safer plan detection - use startsWith to avoid "pro-starter-bundle" edge cases
      const planName = appSubscriptions[0].name?.toLowerCase() || "";
      if (planName.startsWith("starter")) {
        currentPlan = "starter";
      } else if (planName.startsWith("pro")) {
        currentPlan = "pro";
      } else {
        currentPlan = "pro"; // fallback for unknown paid plans
      }
    }
  } catch (err) {
    console.log("PRICING: No active subscription", err.message);
  }

  // Get usage stats for context
  const totalEvents = await prisma.event.count({
    where: { shop }
  });

  const conversions = await prisma.event.count({
    where: { shop, event: "converted" }
  });

  return {
    shop,
    currentPlan,
    hasActiveSubscription,
    stats: {
      totalEvents,
      conversions
    }
  };
};

export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const body = await request.json();
  const { plan } = body;
  const isTestMode = process.env.NODE_ENV !== "production";

  const planMap = {
    starter: "Starter",
    pro: "Pro"
  };

  if (planMap[plan]) {
    // Create subscription and get redirect URL
    const billingResponse = await billing.request({
      plan: planMap[plan],
      isTest: isTestMode,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing?success=true`
    });

    // Strict: only use confirmationUrl, never fallback to object
    if (!billingResponse?.confirmationUrl) {
      console.error("PRICING: Billing failed - no confirmationUrl", billingResponse);
      return { success: false, error: "Billing failed" };
    }

    return { redirectUrl: billingResponse.confirmationUrl };
  }

  return { success: false, error: "Unknown plan" };
};

// Plan definitions - 3 tiers
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with basic nudges",
    features: [
      "Basic nudge banner",
      "1 trigger type (idle)",
      "Fixed 10% discount",
      "100 impressions/month"
    ],
    limitations: [
      "No analytics",
      "No A/B testing",
      "No overrides"
    ],
    cta: null,
    highlight: false
  },
  {
    id: "starter",
    name: "Starter",
    price: "$9",
    period: "/month",
    description: "For growing stores",
    features: [
      "All trigger types",
      "Basic analytics",
      "1,000 impressions/month",
      "Email support"
    ],
    limitations: [
      "No A/B testing",
      "No overrides"
    ],
    cta: "Start with Starter",
    highlight: false
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "Full optimization suite",
    features: [
      "Everything in Starter",
      "Full analytics dashboard",
      "A/B testing",
      "Product/Collection/Tag overrides",
      "Optimization recommendations",
      "Unlimited impressions",
      "Priority support"
    ],
    limitations: [],
    cta: "Upgrade to Pro",
    highlight: true,
    badge: "BEST VALUE"
  }
];

export default function Pricing() {
  const { currentPlan, stats } = useLoaderData();
  const shopify = useAppBridge();
  const [upgradingPlan, setUpgradingPlan] = useState(null);

  const handleUpgrade = async (planId) => {
    // Prevent double clicks
    if (upgradingPlan) return;
    if (planId === currentPlan || planId === "free") return;

    setUpgradingPlan(planId);
    try {
      const res = await fetch("/app/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId })
      });

      const data = await res.json();
      if (data.redirectUrl) {
        window.top.location.href = data.redirectUrl;
      } else {
        shopify.toast.show("Failed to start upgrade", { isError: true });
        setUpgradingPlan(null);
      }
    } catch (err) {
      shopify.toast.show("Error starting upgrade", { isError: true });
      setUpgradingPlan(null);
    }
  };

  // Check for success return from Shopify billing (SSR-safe)
  const [searchParams] = useSearchParams();
  const isSuccess = searchParams.get("success") === "true";

  // Get plan index for comparison
  const planOrder = { free: 0, starter: 1, pro: 2 };
  const currentPlanIndex = planOrder[currentPlan] || 0;

  return (
    <s-page heading="Pricing">
      {/* Success message */}
      {isSuccess && (
        <s-section>
          <s-box padding="base" background="success" borderRadius="base">
            <s-text variant="headingSm">Subscription activated!</s-text>
            <s-text variant="bodySmall" style={{ marginTop: 4 }}>
              Advanced optimization features are now enabled.
            </s-text>
          </s-box>
        </s-section>
      )}

      {/* Current status */}
      <s-section>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-stack direction="inline" gap="loose">
            <s-text>
              Current plan: <strong style={{ textTransform: "capitalize" }}>{currentPlan}</strong>
            </s-text>
            {stats.totalEvents > 0 && (
              <s-text tone="subdued">
                {stats.totalEvents.toLocaleString()} events • {stats.conversions} conversions
              </s-text>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* Plans - 3 column grid */}
      <s-section heading="Choose your plan">
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px"
        }}>
          {PLANS.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan;
            const canUpgrade = planOrder[plan.id] > currentPlanIndex;
            const isUpgrading = upgradingPlan === plan.id;

            return (
              <div
                key={plan.id}
                style={{
                  border: plan.highlight ? "2px solid #008060" : "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "20px",
                  background: plan.highlight ? "#f0fdf4" : "#fff",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div style={{
                    position: "absolute",
                    top: "-10px",
                    right: "12px",
                    background: "#008060",
                    color: "#fff",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: "bold"
                  }}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan name */}
                <s-text variant="headingMd">{plan.name}</s-text>

                {/* Price */}
                <div style={{ margin: "12px 0" }}>
                  <span style={{ fontSize: "32px", fontWeight: "bold" }}>{plan.price}</span>
                  <span style={{ fontSize: "14px", color: "#666" }}>{plan.period}</span>
                </div>

                {/* Description */}
                <s-text variant="bodySmall" tone="subdued" style={{ marginBottom: "16px" }}>
                  {plan.description}
                </s-text>

                {/* Features */}
                <div style={{ flex: 1 }}>
                  {plan.features.map((feature, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: "8px" }}>
                      <span style={{ color: "#008060", marginRight: "8px" }}>✓</span>
                      <s-text variant="bodySmall">{feature}</s-text>
                    </div>
                  ))}

                  {plan.limitations.map((limit, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: "8px" }}>
                      <span style={{ color: "#999", marginRight: "8px" }}>✗</span>
                      <s-text variant="bodySmall" tone="subdued">{limit}</s-text>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <div style={{ marginTop: "16px" }}>
                  {isCurrentPlan ? (
                    <div style={{
                      padding: "10px",
                      background: "#f3f3f3",
                      borderRadius: "6px",
                      textAlign: "center"
                    }}>
                      <s-text variant="bodySmall">Current plan</s-text>
                    </div>
                  ) : canUpgrade && plan.cta ? (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isUpgrading}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: plan.highlight ? "#008060" : "#333",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: "500",
                        cursor: isUpgrading ? "wait" : "pointer",
                        opacity: isUpgrading ? 0.7 : 1
                      }}
                    >
                      {isUpgrading ? "Redirecting..." : plan.cta}
                    </button>
                  ) : !canUpgrade && plan.id !== "free" ? (
                    <div style={{
                      padding: "10px",
                      background: "#f3f3f3",
                      borderRadius: "6px",
                      textAlign: "center"
                    }}>
                      <s-text variant="bodySmall" tone="subdued">Included in your plan</s-text>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </s-section>

      {/* Comparison highlight */}
      {currentPlan === "free" && (
        <s-section>
          <s-box padding="base" background="info" borderRadius="base">
            <s-text variant="headingSm">Why upgrade?</s-text>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
              <div>
                <s-text variant="bodySmall"><strong>Starter ($9/mo)</strong></s-text>
                <s-text variant="bodySmall" tone="subdued">All triggers + basic analytics</s-text>
              </div>
              <div>
                <s-text variant="bodySmall"><strong>Pro ($19/mo)</strong></s-text>
                <s-text variant="bodySmall" tone="subdued">A/B testing + overrides + optimization</s-text>
              </div>
            </div>
          </s-box>
        </s-section>
      )}

      {/* FAQ */}
      <s-section heading="Common questions">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text variant="bodyMd"><strong>Can I cancel anytime?</strong></s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Yes. Cancel from your Shopify admin. You keep features until the billing period ends.
            </s-text>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text variant="bodyMd"><strong>Can I switch plans?</strong></s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Yes. Upgrade anytime and you'll be charged the difference. Downgrade takes effect next billing cycle.
            </s-text>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text variant="bodyMd"><strong>What counts as an "impression"?</strong></s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Each time a user sees the nudge banner on a product page.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
