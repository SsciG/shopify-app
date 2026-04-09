import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);
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
