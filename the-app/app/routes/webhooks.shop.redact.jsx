import crypto from "crypto";
import prisma from "../db.server";

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
  const shop = data.shop_domain;
  console.log("[COMPLIANCE] shop/redact received", shop);

  // Delete all shop data to comply with GDPR
  try {
    await prisma.$transaction([
      prisma.event.deleteMany({ where: { shop } }),
      prisma.discountCode.deleteMany({ where: { shop } }),
      prisma.override.deleteMany({ where: { shop } }),
      prisma.storeSettings.deleteMany({ where: { shop } }),
      prisma.session.deleteMany({ where: { shop } }),
      prisma.shopLicense.deleteMany({ where: { shopDomain: shop } }),
      prisma.pendingInstall.deleteMany({ where: { shopDomain: shop } }),
    ]);
    console.log("[COMPLIANCE] shop/redact - All data deleted for", shop);
  } catch (err) {
    console.error("[COMPLIANCE] shop/redact error:", err);
  }

  return new Response("OK", { status: 200 });
};

export const loader = async () => {
  return new Response("Unauthorized", { status: 401 });
};
