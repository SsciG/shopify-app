/**
 * DEPRECATED: This endpoint optimizes for CLICKS, not CONVERSIONS/REVENUE
 *
 * DO NOT USE THIS ENDPOINT.
 *
 * The correct optimization is in optimizer.server.js which:
 * 1. Optimizes for REVENUE PER IMPRESSION (not CTR)
 * 2. Only learns from TREATMENT group (not control)
 * 3. Deduplicates by sessionId
 *
 * This endpoint is kept for backwards compatibility but returns a deprecation warning.
 */

export const loader = async () => {
  console.warn("⚠️ DEPRECATED: /best-delay endpoint called. Use optimizer.server.js instead.");

  return new Response(JSON.stringify({
    deprecated: true,
    message: "This endpoint is deprecated. Optimization is now handled by get-config via optimizer.server.js",
    reason: "This endpoint optimized for CLICKS (CTR), but the correct objective is REVENUE PER IMPRESSION",
    bestDelay: null,
    bestDiscount: null
  }), {
    status: 410,  // Gone
    headers: { "Content-Type": "application/json" }
  });
};
