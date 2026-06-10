import crypto from "crypto";

function verifyWebhook(payload, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(payload, "utf8").digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(digest));
  } catch {
    return false;
  }
}

export const action = async ({ request }) => {
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const secret = process.env.SHOPIFY_API_SECRET;
  const payload = await request.text();

  if (!verifyWebhook(payload, hmacHeader, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const data = JSON.parse(payload);
  console.log("[COMPLIANCE] customers/redact received", data.shop_domain);

  // We don't store identifiable customer data - only anonymous session events
  // Return 200 to acknowledge receipt

  return new Response("OK", { status: 200 });
};

export const loader = async () => {
  return new Response("Unauthorized", { status: 401 });
};
