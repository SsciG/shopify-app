import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");

  if (!shop) {
    return new Response(JSON.stringify({ error: "missing shop" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 1. Get store settings from database
  const storeSettings = await prisma.storeSettings.findUnique({
    where: { shop }
  });

  const baseConfig = storeSettings || {
    enabled: true,
    discount: 10,
    delay: 4000,
    minDelay: 2000,
    maxDelay: 20000,
    minDiscount: 5,
    maxDiscount: 30,
    explorationRate: 20,
    optimizationMode: "balanced"
  };

  // 2. Check for product-specific override
  let override = null;
  if (productId) {
    override = await prisma.productOverride.findUnique({
      where: { shop_productId: { shop, productId } }
    });
  }

  // 3. Build final config with priority: override > base
  // Handle override modes: force | limit | off
  // Default to "limit" when no override - allows learning within bounds
  const overrideMode = override?.mode || "limit";

  let enabled = baseConfig.enabled;
  let disableOptimize = false;

  if (override) {
    if (overrideMode === "off") {
      enabled = false;
    } else if (overrideMode === "force") {
      disableOptimize = true; // Force = use exact values, skip learning
    }
    // "limit" mode uses learning but within override boundaries
  }

  const config = {
    enabled,
    discount: override?.discount ?? baseConfig.discount,
    delay: override?.delay ?? baseConfig.delay,
    // Use override boundaries if in "limit" mode, otherwise use global
    minDelay: (overrideMode === "limit" && override?.minDelay) || baseConfig.minDelay,
    maxDelay: (overrideMode === "limit" && override?.maxDelay) || baseConfig.maxDelay,
    minDiscount: (overrideMode === "limit" && override?.minDiscount) || baseConfig.minDiscount,
    maxDiscount: (overrideMode === "limit" && override?.maxDiscount) || baseConfig.maxDiscount,
    explorationRate: baseConfig.explorationRate,
    // Use product-specific optimizationMode if set, otherwise use global
    optimizationMode: override?.optimizationMode || baseConfig.optimizationMode,
    // Override flags
    hasOverride: !!override,
    overrideMode,
    disableOptimize,
    forceShow: override?.forceShow ?? false
  };

  console.log("🔥 GET-CONFIG", { shop, productId, hasOverride: !!override });

  return new Response(JSON.stringify(config), {
    headers: { "Content-Type": "application/json" }
  });
};
