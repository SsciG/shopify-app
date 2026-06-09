import { Outlet, useLoaderData, useRouteError, NavLink, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { isShopEntitled, bindShop } from "../lib/licensing.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Check for pending install (in case OAuth was skipped for already-installed apps)
    const pendingInstall = await prisma.pendingInstall.findUnique({
      where: { shopDomain: shop },
    });

    if (pendingInstall) {
      // Process the pending install
      const result = await bindShop({
        licenseKey: pendingInstall.licenseKey,
        shopDomain: shop,
      });

      // Delete the pending install record
      await prisma.pendingInstall.delete({
        where: { shopDomain: shop },
      });

      if (result.success) {
        console.log(`Shop ${shop} bound to license ${pendingInstall.licenseKey}`);
        await prisma.storeSettings.upsert({
          where: { shop },
          update: { isActive: true },
          create: { shop, isActive: true },
        });
      } else {
        console.error(`Shop binding failed for ${shop}:`, result.error);
      }
    }

    // Check license status via ShopLicense + License (jewda flow)
    const entitlement = await isShopEntitled({ shopDomain: shop });

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop,
      isActive: entitlement.entitled,
      plan: entitlement.plan || null,
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
          <strong>No active license found for this store.</strong>
          <div style={{ marginTop: "8px" }}>
            Purchase a subscription at{" "}
            <a
              href="https://jewda.myshopify.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#856404", fontWeight: "bold" }}
            >
              jewda.myshopify.com
            </a>
            {" "}or{" "}
            <a
              href="https://couponpulse.co/license/lookup"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#856404", fontWeight: "bold" }}
            >
              look up your existing license
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
