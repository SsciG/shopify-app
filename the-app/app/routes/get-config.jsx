import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { getNextValues } from "../optimizer.server";

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
  const allOverrides = await prisma.override.findMany({
    where: {
      shop,
      OR: [
        // Product match
        ...(productId ? [{ scopeType: "product", scopeValue: productId }] : []),
        // Collection matches (single query with IN)
        ...(collectionHandles.length > 0 ? [{ scopeType: "collection", scopeValue: { in: collectionHandles } }] : []),
        // Tag matches (single query with IN)
        ...(productTags.length > 0 ? [{ scopeType: "tag", scopeValue: { in: productTags } }] : [])
      ]
    }
  });

  // 4. Apply priority: product > collection > tag
  const productOverride = allOverrides.find(o => o.scopeType === "product");
  const collectionOverride = allOverrides.find(o => o.scopeType === "collection");
  const tagOverride = allOverrides.find(o => o.scopeType === "tag");

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

  // 6. Handle override modes: force | limit | off
  const overrideMode = override?.mode || "limit";

  let enabled = baseConfig.enabled;
  let disableOptimize = false;

  if (override) {
    if (overrideMode === "off") {
      enabled = false;
    } else if (overrideMode === "force") {
      disableOptimize = true; // Force = use exact values, skip learning
    }
    // "limit" mode uses learning but within style adjustments
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
      effectiveDelay = optimized.delay;
      effectiveDiscount = optimized.discount;
      valueSource = optimized.source; // "learned", "exploration", or "default"
    } catch (err) {
      console.warn("GET-CONFIG: Optimizer error, using defaults:", err.message);
    }

    // Apply optimization style adjustments for overrides with "limit" mode
    if (overrideMode === "limit" && override?.optimizationMode) {
      if (override.optimizationMode === "aggressive") {
        effectiveDelay = effectiveDelay - 1000;
        effectiveDiscount = effectiveDiscount + 3;
      } else if (override.optimizationMode === "conservative") {
        effectiveDelay = effectiveDelay + 1000;
        effectiveDiscount = effectiveDiscount - 3;
      }
    }
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
    optimizationMode: override?.optimizationMode || baseConfig.optimizationMode,
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
