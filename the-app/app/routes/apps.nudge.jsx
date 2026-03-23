import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

function generateRandomCode() {
  return "NUDGE_" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function loader({ request }) {
  // App proxy requests use authenticate.public.appProxy
  const { admin, session } = await authenticate.public.appProxy(request);

  if (!admin) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = generateRandomCode();

  const response = await admin.graphql(`
    mutation discountCodeBasicCreate($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      input: {
        title: code,
        code: code,
        startsAt: new Date().toISOString(),
        customerGets: {
          value: { percentage: 0.1 },
          items: { all: true }
        }
      }
    }
  });

  const data = await response.json();

  if (data.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
    console.log("Shopify error:", data.data.discountCodeBasicCreate.userErrors);
    return json({ error: "failed" }, { status: 500 });
  }

  return json({ code });
}

// Also handle POST requests
export const action = loader;
