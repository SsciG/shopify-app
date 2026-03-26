import { useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOptimalConfig } from "../optimizer.server";

// Helper to safely extract count from Prisma groupBy result
const getCount = (item) => {
  if (!item?._count) return 0;
  if (typeof item._count === 'number') return item._count;
  return item._count._all || item._count.event || 0;
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Load settings from database
  const settings = await prisma.storeSettings.findUnique({
    where: { shop }
  });

  // Batch all analytics queries in parallel for performance
  const [
    totalShown,
    totalConverted,
    triggerShown,
    triggerConverted,
    treatmentConverted,
    treatmentShown,
    controlConverted,
    controlShown
  ] = await Promise.all([
    prisma.event.count({ where: { shop, event: "banner_shown" } }),
    prisma.event.count({ where: { shop, event: "converted" } }),
    prisma.event.groupBy({
      by: ["triggerType"],
      where: { shop, event: "banner_shown", triggerType: { not: null } },
      _count: { _all: true }
    }),
    prisma.event.groupBy({
      by: ["triggerType"],
      where: { shop, event: "converted", triggerType: { not: null } },
      _count: { _all: true }
    }),
    prisma.event.count({ where: { shop, event: "converted", decisionSource: "treatment" } }),
    prisma.event.count({ where: { shop, event: "banner_shown", decisionSource: "treatment" } }),
    prisma.event.count({ where: { shop, event: "converted", decisionSource: "control" } }),
    prisma.event.count({ where: { shop, event: "banner_shown", decisionSource: "control" } })
  ]);

  // Best trigger analysis - require minimum sample size for statistical validity
  const MIN_TRIGGER_SAMPLES = 10;
  let bestTrigger = null;
  let bestConversionRate = 0;

  for (const t of triggerShown) {
    const shownCount = getCount(t);
    const convertedItem = triggerConverted.find(c => c.triggerType === t.triggerType);
    const convertedCount = convertedItem ? getCount(convertedItem) : 0;
    const rate = shownCount > 0 ? (convertedCount / shownCount) * 100 : 0;

    if (shownCount >= MIN_TRIGGER_SAMPLES && rate > bestConversionRate) {
      bestConversionRate = rate;
      bestTrigger = t.triggerType;
    }
  }

  // Require minimum sample sizes for statistically meaningful lift calculation
  const MIN_AB_SAMPLES = 20;
  const treatmentRate = treatmentShown > 0 ? (treatmentConverted / treatmentShown) * 100 : 0;
  const controlRate = controlShown > 0 ? (controlConverted / controlShown) * 100 : 0;
  // Only show lift if both groups have enough data AND control has non-zero rate
  const discountLift = (treatmentShown >= MIN_AB_SAMPLES && controlShown >= MIN_AB_SAMPLES && controlRate > 0)
    ? ((treatmentRate - controlRate) / controlRate) * 100
    : null;

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

  const currentSettings = { ...defaultSettings, ...settings };

  // Get learned optimal values
  const learnedConfig = await getOptimalConfig(shop, currentSettings);

  return {
    shop,
    settings: currentSettings,
    insights: {
      totalShown,
      totalConverted,
      overallConversionRate: totalShown > 0 ? ((totalConverted / totalShown) * 100).toFixed(1) : 0,
      bestTrigger,
      bestConversionRate: bestConversionRate.toFixed(1),
      discountLift: discountLift !== null ? discountLift.toFixed(0) : null,
      hasEnoughData: totalShown >= 50
    },
    learned: learnedConfig
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json();
  const { config } = body;

  // Handle global settings
  if (config) {
    // SECURITY: Validate and sanitize all config values (never trust frontend)
    const VALID_OPT_MODES = ["aggressive", "balanced", "conservative"];

    const safeConfig = {
      enabled: typeof config.enabled === "boolean" ? config.enabled : true,
      optimizationMode: VALID_OPT_MODES.includes(config.optimizationMode)
        ? config.optimizationMode
        : "balanced",
      // Clamp numeric values to safe bounds
      minDiscount: Math.max(0, Math.min(100, Math.round(Number(config.minDiscount) || 5))),
      maxDiscount: Math.max(0, Math.min(100, Math.round(Number(config.maxDiscount) || 30))),
      minDelay: Math.max(1000, Math.min(60000, Math.round(Number(config.minDelay) || 2000))),
      maxDelay: Math.max(1000, Math.min(120000, Math.round(Number(config.maxDelay) || 20000)))
    };

    // Ensure min <= max (swap if needed)
    if (safeConfig.minDiscount > safeConfig.maxDiscount) {
      [safeConfig.minDiscount, safeConfig.maxDiscount] = [safeConfig.maxDiscount, safeConfig.minDiscount];
    }
    if (safeConfig.minDelay > safeConfig.maxDelay) {
      [safeConfig.minDelay, safeConfig.maxDelay] = [safeConfig.maxDelay, safeConfig.minDelay];
    }

    try {
      await prisma.storeSettings.upsert({
        where: { shop },
        update: safeConfig,
        create: { shop, ...safeConfig }
      });
      console.log("Settings saved:", { shop, config: safeConfig });
    } catch (err) {
      console.error("SETTINGS SAVE ERROR:", err);
      return { success: false, error: "server error" };
    }
  }

  return { success: true };
};

export default function Settings() {
  const { settings, insights, learned } = useLoaderData();
  const shopify = useAppBridge();

  // Global settings state
  const [enabled, setEnabled] = useState(settings.enabled);
  const [optimizationMode, setOptimizationMode] = useState(settings.optimizationMode);
  const [minDiscount, setMinDiscount] = useState(settings.minDiscount);
  const [maxDiscount, setMaxDiscount] = useState(settings.maxDiscount);
  const [minDelay, setMinDelay] = useState(settings.minDelay);
  const [maxDelay, setMaxDelay] = useState(settings.maxDelay);
  const [saving, setSaving] = useState(false);

  // Check if global settings changed
  const isDirtyGlobal =
    enabled !== settings.enabled ||
    optimizationMode !== settings.optimizationMode ||
    minDiscount !== settings.minDiscount ||
    maxDiscount !== settings.maxDiscount ||
    minDelay !== settings.minDelay ||
    maxDelay !== settings.maxDelay;

  // Save global settings
  const saveGlobal = async () => {
    // Validate bounds
    if (minDiscount < 0 || maxDiscount < 0) {
      shopify.toast.show("Discount cannot be negative", { isError: true });
      return;
    }
    if (minDiscount > maxDiscount) {
      shopify.toast.show("Min discount cannot be greater than max discount", { isError: true });
      return;
    }
    if (minDelay < 1000) {
      shopify.toast.show("Min delay must be at least 1 second", { isError: true });
      return;
    }
    if (minDelay > maxDelay) {
      shopify.toast.show("Min delay cannot be greater than max delay", { isError: true });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/app/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            enabled,
            optimizationMode,
            minDiscount,
            maxDiscount,
            minDelay,
            maxDelay
          }
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        shopify.toast.show("Settings saved!");
      } else {
        shopify.toast.show(data.error || "Failed to save", { isError: true });
      }
    } catch (err) {
      shopify.toast.show("Error saving settings", { isError: true });
    }
    setSaving(false);
  };

  // Format trigger names
  const formatTrigger = (trigger) => {
    const labels = {
      exit_intent: "Exit Intent",
      tab_return: "Tab Return",
      post_cart_idle: "Post-Cart Hesitation",
      scroll_reversal: "Scroll Reversal",
      hesitation: "Variant Comparison",
      consideration: "Long Consideration",
      deep_scroll: "Deep Scroll",
      idle: "Time on Page"
    };
    return labels[trigger] || trigger;
  };

  return (
    <s-page heading="Nudge Settings">

      {/* ===== SECTION 1: SYSTEM STATUS ===== */}
      <s-section>
        <s-box padding="base" borderRadius="base" background={enabled ? "success" : "subdued"}>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="tight" blockAlign="center">
              <s-text variant="headingLg">{enabled ? "✓" : "⏸"}</s-text>
              <s-text variant="headingMd">
                {enabled ? "Nudge Active" : "Nudge Paused"}
              </s-text>
            </s-stack>

            {/* What the system is doing RIGHT NOW */}
            {enabled && learned && (
              <s-box padding="tight" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="bodySmall" tone="subdued">Current AI Decision:</s-text>
                  <s-stack direction="inline" gap="loose">
                    <s-text variant="bodyMd">
                      Delay: <strong>{learned?.delay != null ? (learned.delay / 1000).toFixed(1) : "-"}s</strong>
                    </s-text>
                    <s-text variant="bodyMd">
                      Discount: <strong>{learned?.discount != null ? learned.discount : "-"}%</strong>
                    </s-text>
                    {insights.bestTrigger && (
                      <s-text variant="bodyMd">
                        Best trigger: <strong>{formatTrigger(insights.bestTrigger)}</strong> ({insights.bestConversionRate}% CVR)
                      </s-text>
                    )}
                  </s-stack>
                </s-stack>
              </s-box>
            )}

            {/* Performance */}
            {insights.hasEnoughData && (
              <s-stack direction="inline" gap="loose">
                <s-text variant="bodyMd">
                  Conversion Rate: <strong>{insights.overallConversionRate}%</strong>
                </s-text>
                {insights.discountLift !== null && (
                  <s-text variant="bodyMd">
                    Discount Lift: <strong style={{ color: parseFloat(insights.discountLift) > 0 ? "#2e7d32" : "#c62828" }}>
                      {parseFloat(insights.discountLift) > 0 ? "+" : ""}{insights.discountLift}%
                    </strong>
                  </s-text>
                )}
                <s-text variant="bodySmall" tone="subdued">
                  ({insights.totalShown} shown, {insights.totalConverted} conversions)
                </s-text>
              </s-stack>
            )}

            {!insights.hasEnoughData && enabled && (
              <s-stack direction="block" gap="tight">
                <s-text variant="bodySmall">Collecting data: {insights.totalShown}/50 impressions</s-text>
                <div style={{ width: "100%", height: 4, background: "rgba(0,0,0,0.1)", borderRadius: 2 }}>
                  <div style={{
                    width: `${Math.min((insights.totalShown / 50) * 100, 100)}%`,
                    height: "100%",
                    background: "#2e7d32",
                    borderRadius: 2
                  }} />
                </div>
              </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* ===== SECTION 2: AI OPTIMIZATION STRATEGY ===== */}
      <s-section heading="AI Optimization Strategy">
        <s-text variant="bodySmall" tone="subdued" style={{ marginBottom: 16 }}>
          Control how the AI optimizes discounts and timing for your store.
        </s-text>

        <s-stack direction="block" gap="base">
          {/* Enable/Disable */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            >
              <s-text variant="bodyMd"><strong>Enable Nudge</strong></s-text>
            </s-checkbox>
            <s-text variant="bodySmall" tone="subdued" style={{ marginLeft: 24 }}>
              Turn the nudge banner on/off for your entire store
            </s-text>
          </s-box>

          {/* Optimization Mode */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text variant="bodyMd"><strong>Optimization Style</strong></s-text>
              <s-text variant="bodySmall" tone="subdued">
                How the AI balances conversions vs margin protection
              </s-text>

              <s-stack direction="inline" gap="tight" style={{ marginTop: 8 }}>
                {["aggressive", "balanced", "conservative"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setOptimizationMode(mode)}
                    style={{
                      padding: "8px 16px",
                      border: optimizationMode === mode ? "2px solid #000" : "1px solid #ccc",
                      borderRadius: 6,
                      background: optimizationMode === mode ? "#f5f5f5" : "#fff",
                      cursor: "pointer",
                      fontWeight: optimizationMode === mode ? "bold" : "normal"
                    }}
                  >
                    {mode === "aggressive" && "Aggressive"}
                    {mode === "balanced" && "Balanced"}
                    {mode === "conservative" && "Conservative"}
                  </button>
                ))}
              </s-stack>

              <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
                {optimizationMode === "aggressive" && "Higher discounts, faster triggers — maximize conversions"}
                {optimizationMode === "balanced" && "Default — AI finds the sweet spot automatically"}
                {optimizationMode === "conservative" && "Lower discounts, slower triggers — protect margins"}
              </s-text>
            </s-stack>
          </s-box>

          {/* Discount Bounds */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text variant="bodyMd"><strong>Discount Range</strong></s-text>
              <s-text variant="bodySmall" tone="subdued">
                AI will only offer discounts within this range
              </s-text>

              <s-stack direction="inline" gap="base" style={{ marginTop: 8 }}>
                <s-box style={{ flex: 1 }}>
                  <s-text-field
                    label="Minimum %"
                    type="number"
                    min="0"
                    max="100"
                    value={String(minDiscount)}
                    onChange={(e) => setMinDiscount(Number(e.target.value))}
                  />
                </s-box>
                <s-box style={{ flex: 1 }}>
                  <s-text-field
                    label="Maximum %"
                    type="number"
                    min="0"
                    max="100"
                    value={String(maxDiscount)}
                    onChange={(e) => setMaxDiscount(Number(e.target.value))}
                  />
                </s-box>
              </s-stack>
            </s-stack>
          </s-box>

          {/* Delay Bounds */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text variant="bodyMd"><strong>Timing Range</strong></s-text>
              <s-text variant="bodySmall" tone="subdued">
                How long to wait before showing the banner (in seconds)
              </s-text>

              <s-stack direction="inline" gap="base" style={{ marginTop: 8 }}>
                <s-box style={{ flex: 1 }}>
                  <s-text-field
                    label="Minimum (seconds)"
                    type="number"
                    min="1"
                    max="60"
                    value={String(minDelay / 1000)}
                    onChange={(e) => setMinDelay(Number(e.target.value) * 1000)}
                  />
                </s-box>
                <s-box style={{ flex: 1 }}>
                  <s-text-field
                    label="Maximum (seconds)"
                    type="number"
                    min="1"
                    max="60"
                    value={String(maxDelay / 1000)}
                    onChange={(e) => setMaxDelay(Number(e.target.value) * 1000)}
                  />
                </s-box>
              </s-stack>
            </s-stack>
          </s-box>

          {/* Save Button */}
          <s-stack direction="inline" gap="tight">
            <s-button
              variant="primary"
              onClick={saveGlobal}
              {...(saving ? { loading: true } : {})}
              {...(!isDirtyGlobal ? { disabled: true } : {})}
            >
              {isDirtyGlobal ? "Save Changes" : "No Changes"}
            </s-button>
            {isDirtyGlobal && (
              <s-text variant="bodySmall" tone="warning">Unsaved changes</s-text>
            )}
          </s-stack>
        </s-stack>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
