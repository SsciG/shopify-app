import { Outlet, useLoaderData, useRouteError, NavLink, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { syncBillingStatus } from "../billing.server";

export const loader = async ({ request }) => {
  try {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    // Sync billing with Shopify - returns isActive status
    const { isActive } = await syncBillingStatus(billing, shop);

    // eslint-disable-next-line no-undef
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop,
      isActive
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
  const location = useLocation();
  const search = location.search;
  const isBillingPage = location.pathname.startsWith("/app/billing");

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <NavLink to={`/app${search}`} end>Home</NavLink>
        <NavLink to={`/app/settings${search}`}>Settings</NavLink>
        <NavLink to={`/app/overrides${search}`}>Overrides</NavLink>
        <NavLink to={`/app/analytics${search}`}>Analytics</NavLink>
        <NavLink to={`/app/pricing${search}`}>Pricing</NavLink>
      </s-app-nav>

      {!isActive && !isBillingPage && (
        <div style={{
          background: "#fff3cd",
          padding: "12px",
          borderBottom: "1px solid #ffeeba",
          textAlign: "center"
        }}>
          Your subscription is inactive.
          <a href={`/app/billing${search}`} style={{ marginLeft: 10, color: "#856404", fontWeight: "bold" }}>
            Activate now
          </a>
        </div>
      )}

      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
