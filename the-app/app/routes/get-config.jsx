import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { getNextValues } from "../optimizer.server";

// Valid optimization modes
const VALID_OPT_MODES = ["aggressive", "balanced", "conservative"];

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

  // Validate shop format (must be valid Shopify domain)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return new Response(JSON.stringify({ error: "invalid shop" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Validate productId format (must be digits only to form valid GID)
  if (productId && !/^\d+$/.test(productId)) {
    return new Response(JSON.stringify({ error: "invalid productId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 1. Get store settings from database (global defaults)
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

  // 2. Resolve product collections and tags from Shopify API (single source of truth)
  let collectionHandles = [];
  let productTags = [];

  if (productId) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const response = await admin.graphql(`
        query getProductMeta($id: ID!) {
          product(id: $id) {
            tags
            collections(first: 20) {
              edges {
                node {
                  handle
                }
              }
            }
          }
        }
      `, {
        variables: { id: `gid://shopify/Product/${productId}` }
      });

      const data = await response.json();
      const product = data.data?.product;

      if (product) {
        productTags = (product.tags || []).map(t => t.toLowerCase());
        collectionHandles = product.collections?.edges?.map(e => e.node.handle) || [];
      }
    } catch (err) {
      // If API fails, continue without collections/tags - just use product override if exists
      console.warn("GET-CONFIG: Could not fetch product metadata:", err.message);
    }
  }

  // 3. Find ALL matching overrides in ONE query (for conflict visibility)
  // Build conditions array to avoid empty OR (Prisma edge case)
  const overrideConditions = [];
  if (productId) overrideConditions.push({ scopeType: "product", scopeValue: productId });
  if (collectionHandles.length > 0) overrideConditions.push({ scopeType: "collection", scopeValue: { in: collectionHandles } });
  if (productTags.length > 0) overrideConditions.push({ scopeType: "tag", scopeValue: { in: productTags } });

  const allOverrides = overrideConditions.length > 0
    ? await prisma.override.findMany({ where: { shop, OR: overrideConditions } })
    : [];

  // 4. Apply priority: product > collection > tag
  // For multiple matches of same type, use most recently updated (deterministic)
  const productOverride = allOverrides
    .filter(o => o.scopeType === "product")
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
  const collectionOverride = allOverrides
    .filter(o => o.scopeType === "collection")
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
  const tagOverride = allOverrides
    .filter(o => o.scopeType === "tag")
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;

  // Winner takes all based on priority
  let override = productOverride || collectionOverride || tagOverride || null;
  let matchedScope = override?.scopeType || null;
  let matchedValue = override?.scopeValue || null;

  // 5. Build conflicts object for transparency
  const conflicts = {
    product: productOverride ? { mode: productOverride.mode, value: productOverride.scopeValue } : null,
    collection: collectionOverride ? { mode: collectionOverride.mode, value: collectionOverride.scopeValue } : null,
    tag: tagOverride ? { mode: tagOverride.mode, value: tagOverride.scopeValue } : null,
    hasConflict: allOverrides.length > 1
  };

  // 6. Handle override modes: force | off
  // No override = use AI learning (default behavior)
  // Legacy "limit" or "ai" modes treated as AI learning for backwards compatibility
  const overrideMode = override?.mode || null;

  let enabled = baseConfig.enabled;
  let disableOptimize = false;

  if (override) {
    if (overrideMode === "off") {
      enabled = false;
    } else if (overrideMode === "force") {
      disableOptimize = true; // Force = use exact values, skip learning
    }
    // Any other mode (legacy "limit", "ai", etc.) = use AI learning
  }

  // 7. Get values - either from learning system or manual settings
  let effectiveDelay = baseConfig.delay;
  let effectiveDiscount = baseConfig.discount;
  let valueSource = "default";

  if (disableOptimize) {
    // Force mode: use exact override values
    effectiveDelay = override?.delay ?? baseConfig.delay;
    effectiveDiscount = override?.discount ?? baseConfig.discount;
    valueSource = "forced";
  } else {
    // Learning mode: get optimized values from the learning system
    try {
      const optimized = await getNextValues(shop, baseConfig, baseConfig.explorationRate);

      // Validate optimizer output (fail-safe for bad values)
      if (!optimized || !Number.isFinite(optimized.delay) || !Number.isFinite(optimized.discount)) {
        throw new Error("Invalid optimizer output");
      }

      effectiveDelay = optimized.delay;
      effectiveDiscount = optimized.discount;
      valueSource = optimized.source; // "learned", "exploration", or "default"
    } catch (err) {
      console.warn("GET-CONFIG: Optimizer error, using defaults:", err.message);
    }

    // Apply optimization style adjustments
    // Use global optimizationMode (limit mode was removed)
    const activeOptMode = baseConfig.optimizationMode;

    if (activeOptMode === "aggressive") {
      // Aggressive: lower delay, higher discount
      effectiveDelay = effectiveDelay - 1000;
      effectiveDiscount = effectiveDiscount + 3;
    } else if (activeOptMode === "conservative") {
      // Conservative: higher delay, lower discount
      effectiveDelay = effectiveDelay + 1000;
      effectiveDiscount = effectiveDiscount - 3;
    }
    // "balanced" = no adjustment, use optimizer's decision as-is
  }

  // Clamp to global limits
  effectiveDelay = Math.max(baseConfig.minDelay, Math.min(baseConfig.maxDelay, effectiveDelay));
  effectiveDiscount = Math.max(baseConfig.minDiscount, Math.min(baseConfig.maxDiscount, effectiveDiscount));

  // 8. Build config source for debugging
  const configSource = override
    ? `${matchedScope}:${matchedValue}:${overrideMode}`
    : "global";

  const config = {
    enabled,
    discount: effectiveDiscount,
    delay: effectiveDelay,
    minDelay: baseConfig.minDelay,
    maxDelay: baseConfig.maxDelay,
    minDiscount: baseConfig.minDiscount,
    maxDiscount: baseConfig.maxDiscount,
    explorationRate: baseConfig.explorationRate,
    optimizationMode: VALID_OPT_MODES.includes(baseConfig.optimizationMode) ? baseConfig.optimizationMode : "balanced",
    // Override info
    hasOverride: !!override,
    matchedScope,
    matchedValue,
    overrideMode,
    disableOptimize,
    // Learning info
    valueSource,
    // Debugging
    configSource,
    conflicts
  };

  console.log("GET-CONFIG", { shop, productId, configSource, valueSource, hasConflict: conflicts.hasConflict });

  return new Response(JSON.stringify(config), {
    headers: { "Content-Type": "application/json" }
  });
};
