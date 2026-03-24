import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get settings and basic stats
  const settings = await prisma.storeSettings.findUnique({
    where: { shop }
  });

  const totalEvents = await prisma.event.count({
    where: { shop }
  });

  const conversions = await prisma.event.count({
    where: { shop, event: "converted" }
  });

  return {
    shop,
    isActive: settings?.enabled ?? true,
    totalEvents,
    conversions
  };
};

export default function Index() {
  const { shop, isActive, totalEvents, conversions } = useLoaderData();

  const steps = [
    {
      num: 1,
      title: "Configure Settings",
      desc: "Set your default discount percentage and timing",
      link: "/app/settings",
      done: true
    },
    {
      num: 2,
      title: "Test on Your Store",
      desc: "Visit a product page and wait for the banner to appear",
      link: null,
      done: totalEvents > 0
    },
    {
      num: 3,
      title: "Check Analytics",
      desc: "See which triggers convert best and optimize",
      link: "/app/analytics",
      done: conversions > 0
    }
  ];

  return (
    <s-page heading="Welcome to Nudge">
      {/* Hero Status */}
      <s-section>
        <s-box padding="loose" borderRadius="base" background={isActive ? "success" : "subdued"}>
          <s-stack direction="block" gap="tight">
            <s-text variant="headingLg">
              {isActive ? "Nudge is Active" : "Nudge is Paused"}
            </s-text>
            <s-text variant="bodyMd">
              {isActive
                ? "Behavioral discount banners are showing on your product pages"
                : "Enable Nudge in Settings to start converting hesitant shoppers"
              }
            </s-text>
            {totalEvents > 0 && (
              <s-text variant="bodySmall" tone="subdued">
                {totalEvents} events tracked | {conversions} conversions
              </s-text>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* What is Nudge */}
      <s-section heading="What is Nudge?">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text variant="bodyMd">
              Nudge detects when shoppers hesitate on product pages and shows them a personalized discount banner at the perfect moment to convert them.
            </s-text>

            <s-stack direction="inline" gap="loose">
              <s-box style={{ flex: 1, textAlign: "center" }}>
                <s-text variant="headingLg">1</s-text>
                <s-text variant="bodySm">Shopper browses product</s-text>
              </s-box>
              <s-box style={{ flex: 0, display: "flex", alignItems: "center" }}>
                <s-text variant="headingMd">→</s-text>
              </s-box>
              <s-box style={{ flex: 1, textAlign: "center" }}>
                <s-text variant="headingLg">2</s-text>
                <s-text variant="bodySm">Hesitation detected</s-text>
              </s-box>
              <s-box style={{ flex: 0, display: "flex", alignItems: "center" }}>
                <s-text variant="headingMd">→</s-text>
              </s-box>
              <s-box style={{ flex: 1, textAlign: "center" }}>
                <s-text variant="headingLg">3</s-text>
                <s-text variant="bodySm">Discount banner shown</s-text>
              </s-box>
              <s-box style={{ flex: 0, display: "flex", alignItems: "center" }}>
                <s-text variant="headingMd">→</s-text>
              </s-box>
              <s-box style={{ flex: 1, textAlign: "center" }}>
                <s-text variant="headingLg">4</s-text>
                <s-text variant="bodySm">Conversion!</s-text>
              </s-box>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      {/* How it Works */}
      <s-section heading="How It Works">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base">
              <s-box style={{ width: 48, height: 48, background: "#e3f2fd", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s-text variant="headingLg">1</s-text>
              </s-box>
              <s-box style={{ flex: 1 }}>
                <s-text variant="headingSm">Behavioral Detection</s-text>
                <s-text variant="bodySmall" tone="subdued">
                  Tracks time on page, scroll depth, variant comparisons, and post-cart hesitation to identify shoppers who need a nudge.
                </s-text>
              </s-box>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base">
              <s-box style={{ width: 48, height: 48, background: "#e8f5e9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s-text variant="headingLg">2</s-text>
              </s-box>
              <s-box style={{ flex: 1 }}>
                <s-text variant="headingSm">Smart Timing</s-text>
                <s-text variant="bodySmall" tone="subdued">
                  AI learns the optimal delay for your store. Shows banner only when user hasn't interacted (clicking, scrolling, adding to cart).
                </s-text>
              </s-box>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base">
              <s-box style={{ width: 48, height: 48, background: "#fff3e0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s-text variant="headingLg">3</s-text>
              </s-box>
              <s-box style={{ flex: 1 }}>
                <s-text variant="headingSm">Personalized Discount</s-text>
                <s-text variant="bodySmall" tone="subdued">
                  Creates unique discount codes on-the-fly. One-time use, auto-expiring, tied to the specific product and user session.
                </s-text>
              </s-box>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="inline" gap="base">
              <s-box style={{ width: 48, height: 48, background: "#fce4ec", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s-text variant="headingLg">4</s-text>
              </s-box>
              <s-box style={{ flex: 1 }}>
                <s-text variant="headingSm">A/B Testing Built-in</s-text>
                <s-text variant="bodySmall" tone="subdued">
                  10% of users see no discount (control group) to measure true lift. Know exactly how much revenue Nudge generates.
                </s-text>
              </s-box>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Getting Started */}
      <s-section heading="Getting Started">
        <s-stack direction="block" gap="tight">
          {steps.map((step) => (
            <s-box
              key={step.num}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background={step.done ? "success" : "transparent"}
            >
              <s-stack direction="inline" gap="base">
                <s-box style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: step.done ? "#2e7d32" : "#e0e0e0",
                  color: step.done ? "#fff" : "#333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold"
                }}>
                  {step.done ? "✓" : step.num}
                </s-box>
                <s-box style={{ flex: 1 }}>
                  <s-text variant="headingSm">{step.title}</s-text>
                  <s-text variant="bodySmall" tone="subdued">{step.desc}</s-text>
                </s-box>
                {step.link && (
                  <s-button variant={step.done ? "tertiary" : "primary"}>
                    <Link to={step.link} style={{ textDecoration: "none", color: "inherit" }}>
                      {step.done ? "View" : "Go"}
                    </Link>
                  </s-button>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      {/* Quick Links - Aside */}
      <s-section slot="aside" heading="Quick Actions">
        <s-stack direction="block" gap="tight">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <Link to="/app/settings" style={{ textDecoration: "none" }}>
              <s-stack direction="inline" gap="tight">
                <s-text>Settings</s-text>
                <s-text tone="subdued">→</s-text>
              </s-stack>
              <s-text variant="bodySmall" tone="subdued">Configure discount & timing</s-text>
            </Link>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <Link to="/app/analytics" style={{ textDecoration: "none" }}>
              <s-stack direction="inline" gap="tight">
                <s-text>Analytics</s-text>
                <s-text tone="subdued">→</s-text>
              </s-stack>
              <s-text variant="bodySmall" tone="subdued">View performance data</s-text>
            </Link>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <Link to="/app/overrides" style={{ textDecoration: "none" }}>
              <s-stack direction="inline" gap="tight">
                <s-text>Product Overrides</s-text>
                <s-text tone="subdued">→</s-text>
              </s-stack>
              <s-text variant="bodySmall" tone="subdued">Per-product settings</s-text>
            </Link>
          </s-box>
        </s-stack>
      </s-section>

      {/* Key Features - Aside */}
      <s-section slot="aside" heading="Key Features">
        <s-stack direction="block" gap="tight">
          <s-box padding="tight" background="subdued" borderRadius="base">
            <s-text variant="bodySm">Works on all Shopify themes</s-text>
          </s-box>
          <s-box padding="tight" background="subdued" borderRadius="base">
            <s-text variant="bodySm">No code required</s-text>
          </s-box>
          <s-box padding="tight" background="subdued" borderRadius="base">
            <s-text variant="bodySm">Auto-expiring discount codes</s-text>
          </s-box>
          <s-box padding="tight" background="subdued" borderRadius="base">
            <s-text variant="bodySm">Built-in A/B testing</s-text>
          </s-box>
          <s-box padding="tight" background="subdued" borderRadius="base">
            <s-text variant="bodySm">Per-product configuration</s-text>
          </s-box>
          <s-box padding="tight" background="subdued" borderRadius="base">
            <s-text variant="bodySm">SPA-compatible navigation</s-text>
          </s-box>
        </s-stack>
      </s-section>

      {/* Test Instructions */}
      <s-section slot="aside" heading="Test It Now">
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-stack direction="block" gap="tight">
            <s-text variant="bodySm">1. Open your store</s-text>
            <s-text variant="bodySm">2. Go to any product page</s-text>
            <s-text variant="bodySm">3. Wait 4+ seconds without clicking</s-text>
            <s-text variant="bodySm">4. See the discount banner appear!</s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 8 }}>
              Tip: Add ?nudge_debug to URL for debug mode
            </s-text>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
