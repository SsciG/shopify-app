import { Outlet, useLoaderData, useRouteError, NavLink, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { syncBillingStatus } from "../billing.server";

export const loader = async ({ request }) => {
  try {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    // Sync billing with Shopify and check if paid
    const { needsRedirect } = await syncBillingStatus(billing, shop);

    // eslint-disable-next-line no-undef
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop,
      needsBilling: needsRedirect
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
  const { apiKey, needsBilling } = useLoaderData();
  const location = useLocation();
  const search = location.search;

  // Global billing gate - redirect if not paid
  if (needsBilling) {
    window.location.href = `/app/billing${search}`;
    return null;
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <NavLink to={`/app${search}`} end>Home</NavLink>
        <NavLink to={`/app/settings${search}`}>Settings</NavLink>
        <NavLink to={`/app/overrides${search}`}>Overrides</NavLink>
        <NavLink to={`/app/analytics${search}`}>Analytics</NavLink>
        <NavLink to={`/app/pricing${search}`}>Pricing</NavLink>
      </s-app-nav>
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
