import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { syncBillingStatus } from "../billing.server";

export const loader = async ({ request }) => {
  try {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    // Check subscription status via Shopify Billing API
    const billingStatus = await syncBillingStatus(billing, shop);

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop,
      isActive: billingStatus.isActive,
      plan: billingStatus.plan || null,
    };
  } catch (response) {
    if (response instanceof Response) {
      const location = response.headers.get("Location");
      if (location) {
        response.headers.set("X-Shopify-API-Request-Failure-Reauthorize", "1");
        response.headers.set("X-Shopify-API-Request-Failure-Reauthorize-Url", location);
      }
    }
    throw response;
  }
};

export default function App() {
  const { apiKey, isActive } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <a href="/app" rel="home">Home</a>
        <a href="/app/settings">Settings</a>
        <a href="/app/overrides">Overrides</a>
        <a href="/app/analytics">Analytics</a>
        <a href="/app/pricing">Pricing</a>
      </s-app-nav>

      {!isActive ? (
        <div style={{
          background: "#fff3cd",
          padding: "24px",
          borderBottom: "1px solid #ffeeba",
          textAlign: "center"
        }}>
          <strong>No active subscription.</strong>
          <div style={{ marginTop: "8px" }}>
            <a
              href="/app/pricing"
              style={{ color: "#856404", fontWeight: "bold" }}
            >
              Subscribe to activate all features
            </a>
          </div>
        </div>
      ) : null}

      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
