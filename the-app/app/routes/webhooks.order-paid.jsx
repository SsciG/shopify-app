// Webhook: orders/paid - Track conversions for BOTH treatment and control groups
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

  const orderId = String(payload.id);
  console.log("📊 ORDER PAID WEBHOOK", { shop, orderId });

  const orderTotal = parseFloat(payload.total_price) || 0;

  // === TREATMENT GROUP: Check for NUDGE_ discount codes ===
  const discountCodes = payload.discount_codes || [];

  for (const dc of discountCodes) {
    if (dc.code?.startsWith("NUDGE_")) {
      console.log("📊 NUDGE CODE USED (TREATMENT):", dc.code);

      try {
        // Check if this discount code was already marked as used for this order
        const discountRecord = await prisma.discountCode.findUnique({
          where: { code: dc.code }
        });

        if (discountRecord?.orderId === orderId) {
          console.log("📊 DUPLICATE WEBHOOK - already processed:", dc.code);
          continue; // Skip - already processed
        }

        await prisma.discountCode.updateMany({
          where: { code: dc.code },
          data: {
            used: true,
            usedAt: new Date(),
            orderId,
            orderTotal
          }
        });

        // Re-fetch to get sessionId and other data
        const updatedRecord = await prisma.discountCode.findUnique({
          where: { code: dc.code }
        });

        if (updatedRecord) {
          await prisma.event.create({
            data: {
              shop,
              sessionId: updatedRecord.sessionId,
              event: "converted",
              ts: BigInt(Date.now()),
              productId: updatedRecord.productId,
              triggerType: updatedRecord.triggerType,
              discount: updatedRecord.discount,       // System's decision
              appliedDiscount: updatedRecord.discount, // Treatment group gets the discount
              delay: updatedRecord.delay,
              decisionSource: "treatment",
              orderTotal
            }
          });

          console.log("📊 TREATMENT CONVERSION:", {
            code: dc.code,
            triggerType: updatedRecord.triggerType,
            delay: updatedRecord.delay,
            discount: updatedRecord.discount,
            orderTotal
          });
        }
      } catch (err) {
        console.error("TREATMENT TRACKING ERROR:", err);
      }
    }
  }

  // === CONTROL GROUP: Check for line item properties with _nudge_session ===
  const lineItems = payload.line_items || [];
  const processedSessions = new Set(); // Dedupe within same order

  for (const item of lineItems) {
    const properties = item.properties || [];

    // Properties can be array of {name, value} objects
    const nudgeSession = properties.find(p => p.name === "_nudge_session")?.value;
    const nudgeTrigger = properties.find(p => p.name === "_nudge_trigger")?.value;
    const nudgeControl = properties.find(p => p.name === "_nudge_control")?.value;
    const nudgeDelay = properties.find(p => p.name === "_nudge_delay")?.value;
    const nudgeDiscount = properties.find(p => p.name === "_nudge_discount")?.value;

    if (nudgeSession && nudgeControl === "true") {
      // Dedupe: only process each session once per order
      const dedupeKey = `${nudgeSession}-${orderId}`;
      if (processedSessions.has(dedupeKey)) {
        console.log("📊 SKIPPING DUPLICATE SESSION IN ORDER:", nudgeSession);
        continue;
      }
      processedSessions.add(dedupeKey);

      // Check if we already have a conversion event for this session
      const existingEvent = await prisma.event.findFirst({
        where: {
          shop,
          sessionId: nudgeSession,
          event: "converted",
          decisionSource: "control"
        }
      });

      if (existingEvent) {
        console.log("📊 DUPLICATE WEBHOOK - control conversion already tracked:", nudgeSession);
        continue;
      }

      console.log("📊 CONTROL GROUP CONVERSION:", { nudgeSession, nudgeTrigger });

      try {
        await prisma.event.create({
          data: {
            shop,
            sessionId: nudgeSession,
            event: "converted",
            ts: BigInt(Date.now()),
            productId: String(item.variant_id || item.product_id),
            triggerType: nudgeTrigger || null,
            discount: nudgeDiscount ? parseInt(nudgeDiscount) : null,  // System's decision (for learning)
            appliedDiscount: 0,  // Control group gets no discount applied
            delay: nudgeDelay ? parseInt(nudgeDelay) : null,
            decisionSource: "control",
            orderTotal
          }
        });

        console.log("📊 CONTROL CONVERSION TRACKED:", {
          sessionId: nudgeSession,
          triggerType: nudgeTrigger,
          delay: nudgeDelay,
          productId: item.variant_id,
          orderTotal
        });
      } catch (err) {
        console.error("CONTROL TRACKING ERROR:", err);
      }
    }
  }

  return new Response("OK", { status: 200 });
};
