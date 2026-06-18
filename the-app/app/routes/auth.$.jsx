import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Ensure store has a settings record (billing status is checked in app.jsx)
    await prisma.storeSettings.upsert({
      where: { shop },
      update: {},
      create: { shop, isActive: false },
    });

    return null;
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

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
