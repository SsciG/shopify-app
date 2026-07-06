import { useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  // Get shop from authenticated session (more reliable than URL params)
  const { session } = await authenticate.admin(request);
  const shop = session?.shop;

  if (!shop) {
    return { shop: null, currentPlan: "free", hasActiveSubscription: false, stats: {} };
  }

  // Check local DB for plan status (parent route synced with Shopify)
  const settings = await prisma.storeSettings.findUnique({
    where: { shop },
    select: { isActive: true, plan: true }
  });

  const currentPlan = settings?.isActive ? (settings.plan || "pro") : "free";
  const hasActiveSubscription = settings?.isActive || false;

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
    pro: "Pro",
    enterprise: "Enterprise"
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

// Plan definitions - 3 tiers based on store count
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$4.99",
    period: "/month",
    description: "1 store",
    features: [ ],
    limitations: [],
    cta: "Start with Starter",
    highlight: false
  },
  {
    id: "pro",
    name: "Pro",
    price: "$39.99",
    period: "/month",
    description: "Up to 5 stores",
    features: [],
    limitations: [],
    cta: "Upgrade to Pro",
    highlight: true,
    badge: "MOST POPULAR"
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$49.99",
    period: "/month",
    description: "Up to 10 stores",
    features: [    ],
    limitations: [],
    cta: "Go Enterprise",
    highlight: false,
    badge: "BEST VALUE"
  }
];

export default function Pricing() {
  const { currentPlan, stats } = useLoaderData();
  const shopify = useAppBridge();
  const [upgradingPlan, setUpgradingPlan] = useState(null);

  const handleChangePlan = async (planId) => {
    // Prevent double clicks
    if (upgradingPlan) return;
    if (planId === currentPlan || planId === "free") return;

    setUpgradingPlan(planId);
    try {
      const res = await fetch(`/app/pricing${window.location.search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ plan: planId })
      });

      const data = await res.json();
      if (data.redirectUrl) {
        window.top.location.href = data.redirectUrl;
      } else {
        shopify.toast.show("Failed to start plan change", { isError: true });
        setUpgradingPlan(null);
      }
    } catch (err) {
      shopify.toast.show("Error changing plan", { isError: true });
      setUpgradingPlan(null);
    }
  };

  // Check for success return from Shopify billing (SSR-safe)
  const [searchParams] = useSearchParams();
  const isSuccess = searchParams.get("success") === "true";

  // Get plan index for comparison
  const planOrder = { free: 0, starter: 1, pro: 2, enterprise: 3 };
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
            const canDowngrade = planOrder[plan.id] < currentPlanIndex && plan.id !== "free";
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
                      onClick={() => handleChangePlan(plan.id)}
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
                  ) : canDowngrade ? (
                    <button
                      onClick={() => handleChangePlan(plan.id)}
                      disabled={isUpgrading}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: "#fff",
                        color: "#333",
                        border: "1px solid #999",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: "500",
                        cursor: isUpgrading ? "wait" : "pointer",
                        opacity: isUpgrading ? 0.7 : 1
                      }}
                    >
                      {isUpgrading ? "Redirecting..." : `Downgrade to ${plan.name}`}
                    </button>
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
            <s-text variant="headingSm">Choose the plan that fits your needs</s-text>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginTop: "12px" }}>
              <div>
                <s-text variant="bodySmall"><strong>Starter ($4.99/mo)</strong></s-text>
                <s-text variant="bodySmall" tone="subdued">1 store</s-text>
              </div>
              <div>
                <s-text variant="bodySmall"><strong>Pro ($39.99/mo)</strong></s-text>
                <s-text variant="bodySmall" tone="subdued">Up to 5 stores</s-text>
              </div>
              <div>
                <s-text variant="bodySmall"><strong>Enterprise ($49.99/mo)</strong></s-text>
                <s-text variant="bodySmall" tone="subdued">Up to 10 stores</s-text>
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
              Yes. Upgrade or downgrade anytime right here on this page. Shopify adjusts your charge automatically, and no reinstall or support request is needed.
            </s-text>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text variant="bodyMd"><strong>How does billing work?</strong></s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Billing is handled through Shopify. Your subscription will appear on your regular Shopify bill.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}
