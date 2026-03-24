import { useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOptimalConfig, getLearningStats } from "../optimizer.server";

// Helper to safely extract count from Prisma groupBy result
const getCount = (item) => {
  if (!item?._count) return 0;
  if (typeof item._count === 'number') return item._count;
  return item._count._all || item._count.event || 0;
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Load settings from database (ALWAYS from DB, never global cache)
  const settings = await prisma.storeSettings.findUnique({
    where: { shop }
  });

  // Fetch products from Shopify
  const productsResponse = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            status
            featuredImage {
              url
            }
          }
        }
      }
    }
  `);
  const productsData = await productsResponse.json();
  const shopifyProducts = productsData.data?.products?.edges?.map(e => ({
    id: e.node.id.replace("gid://shopify/Product/", ""),
    title: e.node.title,
    handle: e.node.handle,
    status: e.node.status,
    image: e.node.featuredImage?.url
  })) || [];

  // Get existing overrides for this shop
  const overrides = await prisma.productOverride.findMany({
    where: { shop }
  });

  // Merge products with overrides
  const productsWithOverrides = shopifyProducts.map(product => {
    const override = overrides.find(o =>
      o.productId === product.id || o.productId === product.handle
    );
    return {
      ...product,
      discount: override?.discount ?? null,
      enabled: override?.mode !== "off",
      hasOverride: !!override
    };
  });

  // Get basic stats
  const totalSessions = await prisma.event.groupBy({
    by: ["sessionId"],
    where: { shop }
  }).then(r => r.length);

  const totalShown = await prisma.event.count({
    where: { shop, event: "banner_shown" }
  });

  const totalConverted = await prisma.event.count({
    where: { shop, event: "converted" }
  });

  // THE KEY METRIC: Trigger type performance (CONVERSION, not CTR)
  const triggerShown = await prisma.event.groupBy({
    by: ["triggerType"],
    where: { shop, event: "banner_shown", triggerType: { not: null } },
    _count: { _all: true }
  });

  const triggerConverted = await prisma.event.groupBy({
    by: ["triggerType"],
    where: { shop, event: "converted", triggerType: { not: null } },
    _count: { _all: true }
  });

  // Build trigger performance and find BEST TRIGGER
  let bestTrigger = null;
  let bestConversionRate = 0;
  const triggerPerformance = {};

  for (const t of triggerShown) {
    const shownCount = getCount(t);
    triggerPerformance[t.triggerType] = {
      shown: shownCount,
      converted: 0,
      conversionRate: 0
    };
  }

  for (const t of triggerConverted) {
    if (triggerPerformance[t.triggerType]) {
      const convertedCount = getCount(t);
      const shown = triggerPerformance[t.triggerType].shown;
      const rate = shown > 0 ? (convertedCount / shown) * 100 : 0;

      triggerPerformance[t.triggerType].converted = convertedCount;
      triggerPerformance[t.triggerType].conversionRate = rate;

      // Find best trigger (need minimum 10 shown for statistical relevance)
      if (shown >= 10 && rate > bestConversionRate) {
        bestConversionRate = rate;
        bestTrigger = t.triggerType;
      }
    }
  }

  // Control group comparison (treatment = with discount, control = no discount)
  const treatmentConverted = await prisma.event.count({
    where: { shop, event: "converted", decisionSource: "treatment" }
  });
  const controlConverted = await prisma.event.count({
    where: { shop, event: "converted", decisionSource: "control" }
  });
  const treatmentShown = await prisma.event.count({
    where: { shop, event: "banner_shown", decisionSource: "treatment" }
  });
  const controlShown = await prisma.event.count({
    where: { shop, event: "banner_shown", decisionSource: "control" }
  });

  const treatmentRate = treatmentShown > 0 ? (treatmentConverted / treatmentShown) * 100 : 0;
  const controlRate = controlShown > 0 ? (controlConverted / controlShown) * 100 : 0;
  const discountLift = controlRate > 0 ? ((treatmentRate - controlRate) / controlRate) * 100 : null;

  const defaultSettings = {
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

  const currentSettings = settings || defaultSettings;

  // Get learned optimal values from the optimizer
  const learnedConfig = await getOptimalConfig(shop, currentSettings);
  const learningStats = await getLearningStats(shop);

  return {
    shop,
    settings: currentSettings,
    products: productsWithOverrides,
    insights: {
      totalSessions,
      totalShown,
      totalConverted,
      overallConversionRate: totalShown > 0 ? ((totalConverted / totalShown) * 100).toFixed(1) : 0,
      // THE KEY INSIGHT
      bestTrigger,
      bestConversionRate: bestConversionRate.toFixed(1),
      triggerPerformance,
      // Discount causation
      discountLift: discountLift !== null ? discountLift.toFixed(0) : null,
      treatmentRate: treatmentRate.toFixed(1),
      controlRate: controlRate.toFixed(1),
      hasEnoughData: totalShown >= 50
    },
    // Learning system data
    learned: learnedConfig,
    learningStats
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json();
  const { config, productUpdate } = body;

  // Handle per-product updates
  if (productUpdate) {
    const { productId, discount, enabled } = productUpdate;

    if (enabled === false) {
      // Disable product - set mode to "off"
      await prisma.productOverride.upsert({
        where: { shop_productId: { shop, productId } },
        update: { mode: "off", discount: discount ?? null },
        create: { shop, productId, mode: "off", discount: discount ?? null }
      });
    } else if (discount !== null && discount !== undefined) {
      // Set custom discount
      await prisma.productOverride.upsert({
        where: { shop_productId: { shop, productId } },
        update: { mode: "force", discount },
        create: { shop, productId, mode: "force", discount }
      });
    } else {
      // Remove override (use global settings)
      await prisma.productOverride.deleteMany({
        where: { shop, productId }
      });
    }

    console.log("Product override saved:", { shop, productId, discount, enabled });
    return { success: true, type: "product" };
  }

  // Handle global settings
  if (config) {
    await prisma.storeSettings.upsert({
      where: { shop },
      update: config,
      create: { shop, ...config }
    });
    console.log("Settings saved:", { shop, config });
  }

  return { success: true };
};

export default function Settings() {
  const { settings, insights, products, learned, learningStats } = useLoaderData();
  const shopify = useAppBridge();

  const [enabled, setEnabled] = useState(settings.enabled);
  const [discount, setDiscount] = useState(settings.discount);
  const [delay, setDelay] = useState(settings.delay);
  const [saving, setSaving] = useState(false);
  const [productSettings, setProductSettings] = useState(
    products.reduce((acc, p) => {
      acc[p.id] = { discount: p.discount, enabled: p.enabled };
      return acc;
    }, {})
  );
  const [savingProduct, setSavingProduct] = useState(null);

  // Track if global settings have changed
  const isDirtyGlobal =
    enabled !== settings.enabled ||
    discount !== settings.discount ||
    delay !== settings.delay;

  // Generate impact message based on changes
  const getImpactMessage = () => {
    const parts = [];
    if (discount !== settings.discount) {
      if (discount > 15) parts.push("higher conversions, lower margins");
      else if (discount < 8) parts.push("lower conversions, higher margins");
      else parts.push("balanced performance");
    }
    if (delay !== settings.delay) {
      if (delay < 3000) parts.push("more impressions, may feel aggressive");
      else if (delay > 6000) parts.push("fewer impressions, less intrusive");
    }
    return parts.length > 0 ? ` Expected: ${parts.join(", ")}` : "";
  };

  const save = async () => {
    setSaving(true);

    try {
      const res = await fetch("/app/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            enabled,
            discount,
            delay
          }
        })
      });

      if (res.ok) {
        const impact = getImpactMessage();
        shopify.toast.show(`Settings saved!${impact}`);
      } else {
        shopify.toast.show("Failed to save", { isError: true });
      }
    } catch (err) {
      shopify.toast.show("Error saving settings", { isError: true });
    }
    setSaving(false);
  };

  // Track which products have unsaved changes
  const [dirtyProducts, setDirtyProducts] = useState({});

  // Update local state only (no API call)
  const updateProductSetting = (productId, field, value) => {
    setProductSettings(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value }
    }));
    setDirtyProducts(prev => ({ ...prev, [productId]: true }));
  };

  // Save product setting to API
  const saveProductSetting = async (productId) => {
    setSavingProduct(productId);
    const settings = productSettings[productId] || { discount: null, enabled: true };

    try {
      const res = await fetch("/app/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productUpdate: {
            productId,
            discount: settings.discount,
            enabled: settings.enabled
          }
        })
      });

      if (res.ok) {
        shopify.toast.show("Product setting saved!");
        setDirtyProducts(prev => ({ ...prev, [productId]: false }));
      } else {
        shopify.toast.show("Failed to save", { isError: true });
      }
    } catch (err) {
      shopify.toast.show("Error saving", { isError: true });
    }
    setSavingProduct(null);
  };

  // Format trigger type for display
  const formatTrigger = (trigger) => {
    const labels = {
      post_cart_idle: "Post-Cart Hesitation",
      hesitation: "Variant Comparison",
      deep_scroll: "Deep Scroll",
      idle: "Time on Page"
    };
    return labels[trigger] || trigger;
  };

  // Generate recommendations based on data
  const getRecommendations = () => {
    const recs = [];

    if (delay > 5000) {
      recs.push({
        type: "warning",
        text: `Your delay (${(delay/1000).toFixed(1)}s) is high. Reducing to 3-4s may increase impressions by 15-25%.`
      });
    }
    if (delay < 2000) {
      recs.push({
        type: "warning",
        text: `Your delay (${(delay/1000).toFixed(1)}s) is very low. Users may feel rushed. Consider 3-4s.`
      });
    }
    if (discount > 20) {
      recs.push({
        type: "info",
        text: `High discount (${discount}%) may hurt margins. Test 10-15% first.`
      });
    }
    if (insights.hasEnoughData && parseFloat(insights.discountLift) < 5) {
      recs.push({
        type: "success",
        text: `Discounts show minimal lift (+${insights.discountLift}%). Consider reducing discount to protect margins.`
      });
    }
    if (insights.hasEnoughData && parseFloat(insights.discountLift) > 30) {
      recs.push({
        type: "success",
        text: `Discounts are highly effective (+${insights.discountLift}% lift). Current strategy is working.`
      });
    }

    return recs;
  };

  const recommendations = getRecommendations();

  // Calculate confidence level
  const getConfidence = () => {
    if (insights.totalShown >= 100) return { level: "high", label: "high confidence" };
    if (insights.totalShown >= 50) return { level: "medium", label: "medium confidence" };
    return { level: "low", label: "low confidence" };
  };
  const confidence = getConfidence();

  // Determine system status verdict
  const getSystemStatus = () => {
    if (!insights.hasEnoughData) {
      return { status: "collecting", icon: "📊", text: "Collecting data", bg: "subdued" };
    }
    const lift = parseFloat(insights.discountLift);
    if (lift > 10) {
      return { status: "winning", icon: "🚀", text: `+${insights.discountLift}%`, bg: "success" };
    }
    if (lift < 0) {
      return { status: "losing", icon: "⚠️", text: `${insights.discountLift}%`, bg: "critical" };
    }
    return { status: "neutral", icon: "⚖️", text: `+${insights.discountLift}%`, bg: "warning" };
  };

  const systemStatus = getSystemStatus();

  // Get primary recommendation with WHY context
  const getPrimaryAction = () => {
    if (!enabled) {
      return { action: "Enable Nudge to start converting hesitant shoppers", why: null };
    }
    if (!insights.hasEnoughData) {
      return { action: "Collecting data — no changes needed yet", why: null };
    }

    // Check for best trigger recommendation
    if (insights.bestTrigger) {
      const bestRate = parseFloat(insights.bestConversionRate);
      if (bestRate > 3) {
        return {
          action: `Increase ${formatTrigger(insights.bestTrigger)} usage`,
          why: `converts at ${bestRate}% — your best performer`
        };
      }
    }

    // Check delay recommendation
    if (delay > 5000) {
      return {
        action: `Reduce delay to 3-4 seconds`,
        why: `${(delay/1000).toFixed(1)}s is high — may be missing conversions`
      };
    }

    // Check discount lift
    const lift = parseFloat(insights.discountLift);
    if (lift > 20) {
      return {
        action: "No changes needed — system performing optimally",
        why: `+${lift.toFixed(0)}% conversion lift is excellent`
      };
    }
    if (lift < 5 && lift >= 0) {
      return {
        action: "Consider reducing discount to protect margins",
        why: `only +${lift.toFixed(0)}% lift — discounts not driving conversions`
      };
    }
    if (lift < 0) {
      return {
        action: "Review discount strategy",
        why: `${lift.toFixed(0)}% lift — discounts may be hurting conversions`
      };
    }

    return { action: "Continue monitoring — performance is stable", why: null };
  };

  const primaryAction = getPrimaryAction();

  return (
    <s-page heading="Nudge Settings">
      {/* SINGLE STATUS BLOCK - everything at a glance */}
      <s-section>
        <s-box padding="base" borderRadius="base" background={enabled ? (insights.hasEnoughData ? systemStatus.bg : "success") : "subdued"}>
          <s-stack direction="block" gap="base">
            {/* Status headline with lift + confidence inline */}
            <s-stack direction="inline" gap="tight">
              <s-text variant="headingLg">
                {enabled ? (insights.hasEnoughData ? systemStatus.icon : "✓") : "⏸"}
              </s-text>
              <s-text variant="headingMd">
                {enabled
                  ? (insights.hasEnoughData
                      ? `${systemStatus.text} lift (${confidence.label})`
                      : "Nudge Active")
                  : "Nudge Paused"
                }
              </s-text>
            </s-stack>

            {/* Current Setup (inputs) - explicit label */}
            <s-box>
              <s-text variant="bodySmall" tone="subdued">Current Setup</s-text>
              <s-text variant="bodyMd">
                Delay: <strong>{(delay / 1000).toFixed(1)}s</strong> • Discount: <strong>{discount}%</strong>
              </s-text>
            </s-box>

            {/* Performance (outputs) - CVR as anchor metric */}
            <s-box>
              <s-text variant="bodySmall" tone="subdued">Performance</s-text>
              {insights.hasEnoughData ? (
                <s-stack direction="block" gap="none">
                  <s-text variant="headingSm" style={{ color: parseFloat(insights.overallConversionRate) > 2 ? "#2e7d32" : "inherit" }}>
                    Conversion Rate: {insights.overallConversionRate}%
                  </s-text>
                  <s-text variant="bodySmall" tone="subdued">
                    {insights.totalShown} shown • {insights.totalConverted} conversions
                  </s-text>
                </s-stack>
              ) : (
                <s-stack direction="block" gap="none">
                  <s-text variant="bodyMd">
                    Collecting data ({insights.totalShown}/50)
                  </s-text>
                  <div style={{
                    width: "100%",
                    height: 4,
                    background: "rgba(0,0,0,0.1)",
                    borderRadius: 2,
                    marginTop: 4
                  }}>
                    <div style={{
                      width: `${Math.min((insights.totalShown / 50) * 100, 100)}%`,
                      height: "100%",
                      background: "#2e7d32",
                      borderRadius: 2,
                      transition: "width 0.3s"
                    }} />
                  </div>
                </s-stack>
              )}
            </s-box>

            {/* Priority Action with WHY - ALWAYS shown */}
            <s-box padding="tight" background="subdued" borderRadius="base">
              <s-text variant="bodySmall">
                <strong>👉 Priority Action:</strong> {primaryAction.action}
              </s-text>
              {primaryAction.why && (
                <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 2 }}>
                  (because {primaryAction.why})
                </s-text>
              )}
            </s-box>
          </s-stack>
        </s-box>
      </s-section>

      {/* Learning System Status */}
      <s-section heading="Auto-Optimization">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            {/* Learning status */}
            <s-stack direction="inline" gap="tight">
              <s-text variant="headingSm">
                {learned.isLearning ? "📊 Learning..." : "🎯 Optimized"}
              </s-text>
              <s-text variant="bodySmall" tone="subdued">
                ({learned.confidence} confidence)
              </s-text>
            </s-stack>

            {learned.isLearning ? (
              <s-stack direction="block" gap="tight">
                <s-text variant="bodySmall">
                  Collecting data: {learned.dataPoints}/{learned.minRequired} impressions
                </s-text>
                <div style={{
                  width: "100%",
                  height: 6,
                  background: "rgba(0,0,0,0.1)",
                  borderRadius: 3
                }}>
                  <div style={{
                    width: `${Math.min((learned.dataPoints / learned.minRequired) * 100, 100)}%`,
                    height: "100%",
                    background: "#2e7d32",
                    borderRadius: 3,
                    transition: "width 0.3s"
                  }} />
                </div>
                <s-text variant="bodySmall" tone="subdued">
                  Using your default settings until enough data is collected.
                </s-text>
              </s-stack>
            ) : (
              <s-stack direction="block" gap="tight">
                {/* Show what was learned */}
                <s-stack direction="inline" gap="loose">
                  <s-box padding="tight" background="success" borderRadius="base">
                    <s-text variant="bodySmall">
                      Best delay: <strong>{(learned.delay / 1000).toFixed(1)}s</strong>
                    </s-text>
                  </s-box>
                  <s-box padding="tight" background="success" borderRadius="base">
                    <s-text variant="bodySmall">
                      Best discount: <strong>{learned.discount}%</strong>
                    </s-text>
                  </s-box>
                  <s-box padding="tight" background="subdued" borderRadius="base">
                    <s-text variant="bodySmall">
                      CVR: <strong>{learned.conversionRate}%</strong>
                    </s-text>
                  </s-box>
                </s-stack>

                {/* Recommendation */}
                {learned.recommendation && (
                  <s-box padding="tight" background="info" borderRadius="base">
                    <s-text variant="bodySmall">
                      💡 {learned.recommendation}
                    </s-text>
                  </s-box>
                )}

                {/* Top performing combos */}
                {learned.testedCombos?.length > 0 && (
                  <s-stack direction="block" gap="none">
                    <s-text variant="bodySmall" tone="subdued" style={{ marginBottom: 4 }}>
                      Tested combinations (by conversion rate):
                    </s-text>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {learned.testedCombos.map((combo, i) => (
                        <span
                          key={i}
                          style={{
                            padding: "2px 8px",
                            background: i === 0 ? "#e8f5e9" : "#f5f5f5",
                            borderRadius: 4,
                            fontSize: 12,
                            border: i === 0 ? "1px solid #4caf50" : "1px solid #ddd"
                          }}
                        >
                          {(combo.delay / 1000).toFixed(0)}s / {combo.discount}% → {combo.rate.toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </s-stack>
                )}
              </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* Global Settings */}
      <s-section heading="Default Settings">
        <s-text variant="bodySmall" tone="subdued" style={{ marginBottom: 12 }}>
          These are your starting values. The system learns from these and finds what works best for your store.
        </s-text>
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-checkbox
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              >
                Enable Nudge Banner
              </s-checkbox>
              <s-text variant="bodySmall" tone="subdued">
                Turn the nudge banner on/off globally for your entire store
              </s-text>
            </s-stack>
          </s-box>

          <s-stack direction="inline" gap="base">
            <s-box style={{ flex: 1 }}>
              <s-text-field
                label="Starting Discount (%)"
                type="number"
                value={String(discount)}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
              <s-text variant="bodySmall" tone="subdued">
                Starting point for optimization (system will find the best value)
              </s-text>
            </s-box>
            <s-box style={{ flex: 1 }}>
              <s-text-field
                label="Starting Delay (ms)"
                type="number"
                value={String(delay)}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
              <s-text variant="bodySmall" tone="subdued">
                Starting point for optimization (e.g., 4000 = 4 seconds)
              </s-text>
            </s-box>
          </s-stack>

          <s-stack direction="inline" gap="tight">
            <s-button
              variant="primary"
              onClick={save}
              {...(saving ? { loading: true } : {})}
              {...(!isDirtyGlobal && !saving ? { disabled: true } : {})}
            >
              {isDirtyGlobal ? "Save Settings" : "No Changes"}
            </s-button>
            {isDirtyGlobal && (
              <s-text variant="bodySmall" tone="warning">Unsaved changes</s-text>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      {/* Per-Product Settings */}
      <s-section heading="Product Settings">
        <s-paragraph>
          Configure discount percentage and enable/disable nudge banner for individual products.
          Products without custom settings will use the global default ({discount}%).
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <th style={{ textAlign: "left", padding: "8px" }}>Product</th>
                <th style={{ textAlign: "center", padding: "8px", width: "100px" }}>Discount %</th>
                <th style={{ textAlign: "center", padding: "8px", width: "80px" }}>Enabled</th>
                <th style={{ textAlign: "center", padding: "8px", width: "80px" }}></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const settings = productSettings[product.id] || { discount: null, enabled: true };
                const isSaving = savingProduct === product.id;
                const isDirty = dirtyProducts[product.id];

                return (
                  <tr key={product.id} style={{ borderBottom: "1px solid #eee", background: isDirty ? "#fffde7" : "transparent" }}>
                    <td style={{ padding: "8px" }}>
                      <s-stack direction="inline" gap="tight">
                        {product.image && (
                          <img
                            src={product.image}
                            alt={product.title}
                            style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }}
                          />
                        )}
                        <s-stack direction="block" gap="none">
                          <s-text variant="bodyMd">{product.title}</s-text>
                          <s-text variant="bodySmall" tone="subdued">
                            {settings.discount !== null ? `${settings.discount}%` : `Default (${discount}%)`}
                          </s-text>
                        </s-stack>
                      </s-stack>
                    </td>
                    <td style={{ textAlign: "center", padding: "8px" }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder={String(discount)}
                        value={settings.discount ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : Number(e.target.value);
                          updateProductSetting(product.id, "discount", val);
                        }}
                        disabled={isSaving}
                        style={{
                          width: "60px",
                          padding: "4px 8px",
                          textAlign: "center",
                          border: isDirty ? "2px solid #ffc107" : "1px solid #ccc",
                          borderRadius: "4px"
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center", padding: "8px" }}>
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => updateProductSetting(product.id, "enabled", e.target.checked)}
                        disabled={isSaving}
                        style={{ width: 18, height: 18, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ textAlign: "center", padding: "8px" }}>
                      {isDirty && (
                        <s-button
                          variant="primary"
                          size="slim"
                          onClick={() => saveProductSetting(product.id)}
                          {...(isSaving ? { loading: true, disabled: true } : {})}
                        >
                          Save
                        </s-button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </s-box>

        {products.length === 0 && (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text>No products found in your store.</s-text>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
