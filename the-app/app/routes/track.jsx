import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const body = await request.json();

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

    console.log("📊 EVENT:", event, "| shop:", shop, "| session:", sessionId?.slice(0, 8), "| trigger:", triggerType || "-");

    // Store the event with shop scoping
    await prisma.event.create({
      data: {
        shop,
        sessionId,
        event,
        ts: BigInt(ts || Date.now()),
        productId: productId || null,
        triggerType: triggerType || null,
        delay: delay || null,
        discount: discount || null,              // System's decision
        appliedDiscount: appliedDiscount || null, // What was actually shown
        decisionSource: decisionSource || null,
        idleTime: idleTime || null,
        scrollDepth: scrollDepth || null,
        variantChanges: variantChanges || null
      }
    });

    // NOTE: SessionMetrics is deprecated - all metrics computed from Event table
    // Keeping minimal update for backwards compatibility during transition
    // TODO: Remove this block after confirming analytics works from Event table

    return new Response(JSON.stringify({ ok: true }));

  } catch (err) {
    console.error("TRACK ERROR:", err);
    return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
  }
};