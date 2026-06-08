import { Outlet, useLoaderData, useRouteError, NavLink, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Check subscription status via UserStore + UserSubscription (Lemon Squeezy flow)
    const userStore = await prisma.userStore.findUnique({
      where: { shop },
      include: {
        user: {
          include: {
            subscription: true,
          },
        },
      },
    });

    // Shop is active if:
    // 1. UserStore exists with status "active"
    // 2. Related user has an active subscription
    let isActive = false;
    if (userStore && userStore.status === "active") {
      const subscription = userStore.user?.subscription;
      if (subscription && subscription.status === "active") {
        isActive = true;
      }
    }

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

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <NavLink to={`/app${search}`} end>Home</NavLink>
        <NavLink to={`/app/settings${search}`}>Settings</NavLink>
        <NavLink to={`/app/overrides${search}`}>Overrides</NavLink>
        <NavLink to={`/app/analytics${search}`}>Analytics</NavLink>
        <NavLink to={`/app/pricing${search}`}>Pricing</NavLink>
      </s-app-nav>

      {!isActive ? (
        <div style={{
          background: "#fff3cd",
          padding: "24px",
          borderBottom: "1px solid #ffeeba",
          textAlign: "center"
        }}>
          <strong>Your subscription is inactive.</strong>
          <div style={{ marginTop: "8px" }}>
            Please activate your Coupon Pulse subscription at{" "}
            <a
              href="https://couponpulse.co/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#856404", fontWeight: "bold" }}
            >
              couponpulse.co
            </a>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
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
