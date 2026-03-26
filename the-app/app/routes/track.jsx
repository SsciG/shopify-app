import prisma from "../db.server";

// Valid event types for analytics integrity
const ALLOWED_EVENTS = [
  "trigger_eligible",
  "banner_shown",
  "banner_clicked",
  "banner_closed",
  "converted",
  "tab_return",
  "optimizer_decision"
];

// Valid decision sources for A/B testing
const ALLOWED_SOURCES = ["control", "treatment"];

export const action = async ({ request }) => {
  try {
    // Payload size protection - read as text first (header can be omitted/spoofed)
    const raw = await request.text();
    if (raw.length > 5000) {
      return new Response(JSON.stringify({ error: "payload too large" }), { status: 413 });
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
    }

    const {
      shop,  // CRITICAL: must be included in all events
      sessionId,
      event,
      ts,
      productId,
      triggerType,
      delay,
      discount,        // System's decision (what optimizer chose)
      appliedDiscount, // What was actually applied (0 for control group)
      decisionSource,
      idleTime,
      scrollDepth,
      variantChanges
    } = body;

    if (!sessionId || !event || !shop) {
      return new Response(JSON.stringify({ error: "missing fields (shop, sessionId, event required)" }), { status: 400 });
    }

    // Validate shop format (must be valid Shopify domain)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
      return new Response(JSON.stringify({ error: "invalid shop" }), { status: 400 });
    }

    // Validate event type (prevent analytics pollution)
    if (!ALLOWED_EVENTS.includes(event)) {
      return new Response(JSON.stringify({ error: "invalid event" }), { status: 400 });
    }

    // Validate sessionId length (prevent DB pollution)
    if (sessionId.length > 64) {
      return new Response(JSON.stringify({ error: "invalid session" }), { status: 400 });
    }

    // Sanitize and clamp numeric fields (prevent data pollution + unrealistic values)
    const safeNum = (val) => Number.isFinite(Number(val)) ? Number(val) : null;
    const clamp = (val, min, max) => val === null ? null : Math.max(min, Math.min(max, val));

    const safeDelay = clamp(safeNum(delay), 0, 120000);           // 0-120 seconds max
    const safeDiscount = clamp(safeNum(discount), 0, 100);        // 0-100%
    const safeAppliedDiscount = clamp(safeNum(appliedDiscount), 0, 100); // 0-100%
    const safeIdleTime = clamp(safeNum(idleTime), 0, 3600);       // 0-1 hour max
    const safeScrollDepth = clamp(safeNum(scrollDepth), 0, 1);    // 0-1 (normalized)
    const safeVariantChanges = clamp(safeNum(variantChanges), 0, 100); // 0-100 max

    // Debug logging for invalid values (helps catch client bugs)
    if (delay != null && safeDelay === null) console.warn("⚠️ Invalid delay:", delay);
    if (discount != null && safeDiscount === null) console.warn("⚠️ Invalid discount:", discount);
    if (decisionSource && !ALLOWED_SOURCES.includes(decisionSource)) {
      console.warn("⚠️ Invalid decisionSource:", decisionSource);
    }

    // Safe BigInt for timestamp (prevent crash + overflow on invalid input)
    const now = Date.now();
    const parsedTs = Number(ts);
    const safeTs = Number.isFinite(parsedTs) && parsedTs > 0 && parsedTs < now + 60000
      ? BigInt(Math.round(parsedTs))
      : BigInt(now);

    console.log("📊 EVENT:", event, "| shop:", shop, "| session:", sessionId?.slice(0, 8), "| trigger:", triggerType || "-");

    // Store the event with shop scoping
    await prisma.event.create({
      data: {
        shop,
        sessionId,
        event,
        ts: safeTs,
        productId: productId ?? null,
        triggerType: triggerType ?? null,
        delay: safeDelay,
        discount: safeDiscount,              // System's decision
        appliedDiscount: safeAppliedDiscount, // What was actually shown (0 for control!)
        decisionSource: ALLOWED_SOURCES.includes(decisionSource) ? decisionSource : null,
        idleTime: safeIdleTime,
        scrollDepth: safeScrollDepth,
        variantChanges: safeVariantChanges
      }
    });

    return new Response(JSON.stringify({ ok: true }));

  } catch (err) {
    console.error("TRACK ERROR:", err);
    return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
  }
};