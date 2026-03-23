import { useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

  return {
    shop,
    settings: settings || defaultSettings,
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
    }
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
  const { settings, insights, products } = useLoaderData();
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

  // Determine system status verdict
  const getSystemStatus = () => {
    if (!insights.hasEnoughData) {
      return { status: "collecting", icon: "📊", text: "Collecting data", bg: "subdued" };
    }
    const lift = parseFloat(insights.discountLift);
    if (lift > 10) {
      return { status: "winning", icon: "🚀", text: "System performing well", bg: "success" };
    }
    if (lift < 0) {
      return { status: "losing", icon: "⚠️", text: "Discounts hurting performance", bg: "critical" };
    }
    return { status: "neutral", icon: "⚖️", text: "Inconclusive results", bg: "warning" };
  };

  const systemStatus = getSystemStatus();

  return (
    <s-page heading="Nudge Settings">
      {/* Status Verdict - instant answer to "am I winning?" */}
      <s-section heading="Status">
        <s-box padding="base" borderRadius="base" background={systemStatus.bg}>
          <s-text variant="headingMd">{systemStatus.icon} {systemStatus.text}</s-text>
          {insights.hasEnoughData && (
            <s-text variant="bodySmall">
              {parseFloat(insights.discountLift) > 0 ? "+" : ""}{insights.discountLift}% conversion lift • {insights.totalConverted} conversions • ${insights.totalRevenue || 0} revenue
            </s-text>
          )}
          {!insights.hasEnoughData && (
            <s-text variant="bodySmall">{insights.totalShown}/50 impressions needed</s-text>
          )}
        </s-box>
      </s-section>

      {/* Current Behavior Summary - instant clarity */}
      <s-section heading="Current Behavior">
        <s-box padding="base" borderWidth="base" borderRadius="base" background={enabled ? "success" : "subdued"}>
          <s-stack direction="inline" gap="loose">
            <s-box style={{ flex: 1 }}>
              <s-text variant="bodySmall" tone="subdued">Status</s-text>
              <s-text variant="headingMd">{enabled ? "✓ Active" : "✗ Disabled"}</s-text>
            </s-box>
            <s-box style={{ flex: 1 }}>
              <s-text variant="bodySmall" tone="subdued">Showing after</s-text>
              <s-text variant="headingMd">{(delay / 1000).toFixed(1)}s</s-text>
            </s-box>
            <s-box style={{ flex: 1 }}>
              <s-text variant="bodySmall" tone="subdued">Default discount</s-text>
              <s-text variant="headingMd">{discount}%</s-text>
            </s-box>
            <s-box style={{ flex: 1 }}>
              <s-text variant="bodySmall" tone="subdued">Conversions</s-text>
              <s-text variant="headingMd">{insights.totalConverted}</s-text>
            </s-box>
          </s-stack>
        </s-box>
      </s-section>

      {/* AI-style Recommendations */}
      {recommendations.length > 0 && (
        <s-section heading="💡 Recommendations">
          <s-stack direction="block" gap="tight">
            {recommendations.map((rec, i) => (
              <s-box
                key={i}
                padding="base"
                borderRadius="base"
                background={rec.type === "warning" ? "warning" : rec.type === "success" ? "success" : "subdued"}
              >
                <s-text>{rec.text}</s-text>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

      {/* Performance snapshot - only when data exists */}
      {insights.hasEnoughData && (
        <s-section heading="Performance">
          <s-stack direction="inline" gap="base">
            {insights.bestTrigger && (
              <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1 }}>
                <s-text variant="bodySmall" tone="subdued">Best Trigger</s-text>
                <s-text variant="headingMd">{formatTrigger(insights.bestTrigger)}</s-text>
                <s-text tone="success">{insights.bestConversionRate}% CVR</s-text>
              </s-box>
            )}
            <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1 }}>
              <s-text variant="bodySmall" tone="subdued">Discount Impact</s-text>
              <s-text variant="headingMd" tone={parseFloat(insights.discountLift) > 0 ? "success" : "critical"}>
                {parseFloat(insights.discountLift) > 0 ? "+" : ""}{insights.discountLift}% lift
              </s-text>
              <s-text variant="bodySmall" tone="subdued">vs control group</s-text>
            </s-box>
            <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1 }}>
              <s-text variant="bodySmall" tone="subdued">Overall CVR</s-text>
              <s-text variant="headingMd">{insights.overallConversionRate}%</s-text>
              <s-text variant="bodySmall" tone="subdued">{insights.totalShown} shown</s-text>
            </s-box>
          </s-stack>
        </s-section>
      )}

      {!insights.hasEnoughData && (
        <s-section heading="📊 Getting Started">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text variant="headingSm">Collecting data... ({insights.totalShown}/50 impressions)</s-text>
              <s-text variant="bodySmall">To speed this up:</s-text>
              <s-text variant="bodySmall">• Visit your store's product pages</s-text>
              <s-text variant="bodySmall">• Stay on page for {(delay/1000).toFixed(0)}+ seconds to trigger banner</s-text>
              <s-text variant="bodySmall">• Add items to cart then hesitate</s-text>
              <s-text variant="bodySmall">• Scroll through product descriptions</s-text>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* Global Settings */}
      <s-section heading="Global Settings">
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
                label="Default Discount (%)"
                type="number"
                value={String(discount)}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
              <s-text variant="bodySmall" tone="subdued">
                Default discount offered to customers (applies to products without custom settings)
              </s-text>
            </s-box>
            <s-box style={{ flex: 1 }}>
              <s-text-field
                label="Delay (ms)"
                type="number"
                value={String(delay)}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
              <s-text variant="bodySmall" tone="subdued">
                Base delay before showing banner (e.g., 4000 = 4 seconds)
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
              {isDirtyGlobal ? "Save Global Settings" : "No Changes"}
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
