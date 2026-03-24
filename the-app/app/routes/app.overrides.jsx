import { useState, useMemo } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Tooltip component with ⓘ icon
function Tooltip({ text }) {
  return (
    <span className="tooltip-wrapper">
      <span className="tooltip-icon">ⓘ</span>
      <span className="tooltip-text">{text}</span>
      <style>{`
        .tooltip-wrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          margin-left: 4px;
        }
        .tooltip-icon {
          color: #666;
          cursor: help;
          font-size: 13px;
        }
        .tooltip-text {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: #1a1a1a;
          color: #fff;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          max-width: 250px;
          white-space: normal;
          z-index: 1000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          transition: opacity 0.15s, visibility 0.15s;
        }
        .tooltip-text::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: #1a1a1a;
        }
        .tooltip-wrapper:hover .tooltip-text {
          visibility: visible;
          opacity: 1;
        }
      `}</style>
    </span>
  );
}

// Strategy descriptions with "when to use" context
const STRATEGY_INFO = {
  force: {
    label: "Lock behavior",
    desc: "Use fixed discount and timing",
    when: "Use when you know exactly what works for this item"
  },
  limit: {
    label: "Let system optimize",
    desc: "System adjusts within safe limits",
    when: "Best for most products — learns what converts",
    recommended: true
  },
  off: {
    label: "Disable nudge",
    desc: "Do not show banner",
    when: "Use for premium items that shouldn't be discounted"
  }
};

// Optimization style descriptions with context
const OPT_STYLE_INFO = {
  aggressive: {
    label: "Aggressive",
    desc: "Shows sooner, offers more",
    tooltip: "Banner shows 1s sooner than your default, discount 3% higher than your default. Good for clearance items."
  },
  balanced: {
    label: "Balanced",
    desc: "Uses your defaults",
    tooltip: "Uses your global delay and discount settings exactly. Best starting point."
  },
  conservative: {
    label: "Conservative",
    desc: "Shows later, offers less",
    tooltip: "Banner shows 1s later than your default, discount 3% lower than your default. Good for premium items."
  }
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Load from new Override table
  const overrides = await prisma.override.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" }
  });

  // Fetch collections with product counts (primary use case for scale)
  const collectionsResponse = await admin.graphql(`
    query {
      collections(first: 100) {
        edges {
          node {
            id
            title
            handle
            productsCount {
              count
            }
          }
        }
      }
    }
  `);
  const collectionsData = await collectionsResponse.json();
  const collections = collectionsData.data?.collections?.edges?.map(e => ({
    id: e.node.id.replace("gid://shopify/Collection/", ""),
    title: e.node.title,
    handle: e.node.handle,
    productCount: e.node.productsCount?.count || 0
  })) || [];

  // Get total product count for context
  const productCountResponse = await admin.graphql(`
    query {
      productsCount {
        count
      }
    }
  `);
  const productCountData = await productCountResponse.json();
  const totalProducts = productCountData.data?.productsCount?.count || 0;

  // Get store settings for defaults
  const settings = await prisma.storeSettings.findUnique({
    where: { shop }
  });

  return {
    shop,
    overrides,
    collections,
    totalProducts,
    defaults: {
      discount: settings?.discount ?? 10,
      delay: settings?.delay ?? 4000
    }
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json();
  const { action, id, override } = body;

  if (action === "save") {
    const { scopeType, scopeValue, mode, discount, delay, optimizationMode } = override;

    await prisma.override.upsert({
      where: {
        shop_scopeType_scopeValue: { shop, scopeType, scopeValue }
      },
      update: {
        mode,
        discount: discount ?? null,
        delay: delay ?? null,
        optimizationMode: optimizationMode ?? null
      },
      create: {
        shop,
        scopeType,
        scopeValue,
        mode,
        discount: discount ?? null,
        delay: delay ?? null,
        optimizationMode: optimizationMode ?? null
      }
    });
    console.log("OVERRIDE SAVED", { shop, scopeType, scopeValue, mode });
    return { success: true };
  }

  if (action === "delete") {
    await prisma.override.delete({
      where: { id }
    });
    console.log("OVERRIDE DELETED", { id });
    return { success: true };
  }

  return { success: false };
};

// Scope type options with descriptions
const SCOPE_INFO = {
  collection: {
    label: "Collection",
    hint: "Best for categories like 'Sale' or 'New Arrivals'",
    placeholder: "Select a collection..."
  },
  product: {
    label: "Product (advanced)",
    hint: "For specific products — enter handle or ID",
    placeholder: "e.g., blue-widget or 123456789"
  },
  tag: {
    label: "Tag (power tool)",
    hint: "Applies to ALL products with this tag",
    placeholder: "e.g., clearance, premium, seasonal"
  }
};

export default function Overrides() {
  const { overrides, collections, totalProducts, defaults } = useLoaderData();
  const shopify = useAppBridge();

  // Form state - collection is default (scales better)
  const [scopeType, setScopeType] = useState("collection");
  const [scopeValue, setScopeValue] = useState("");
  const [strategy, setStrategy] = useState("limit");
  const [discount, setDiscount] = useState("");
  const [delay, setDelay] = useState("");
  const [optStyle, setOptStyle] = useState("balanced");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // Calculate effective preview
  const preview = useMemo(() => {
    let effectiveDelay = delay ? Number(delay) : defaults.delay;
    let effectiveDiscount = discount ? Number(discount) : defaults.discount;

    // Apply optimization style adjustments for "limit" mode
    if (strategy === "limit") {
      if (optStyle === "aggressive") {
        effectiveDelay = Math.max(1000, effectiveDelay - 1000);
        effectiveDiscount = Math.min(50, effectiveDiscount + 3);
      } else if (optStyle === "conservative") {
        effectiveDelay = effectiveDelay + 1000;
        effectiveDiscount = Math.max(5, effectiveDiscount - 3);
      }
    }

    return {
      delay: effectiveDelay,
      discount: effectiveDiscount,
      strategy: STRATEGY_INFO[strategy].label
    };
  }, [delay, discount, strategy, optStyle, defaults]);

  // Get display name for scope value
  const getScopeLabel = (type, value) => {
    if (type === "collection") {
      const c = collections.find(c => c.handle === value || c.id === value);
      return c ? c.title : value;
    }
    // Product and tag: just show the value (no products list loaded for scale)
    return value;
  };

  // Calculate impact preview (how many products affected)
  const getImpactPreview = () => {
    if (!scopeValue) return null;

    if (scopeType === "collection") {
      const c = collections.find(c => c.handle === scopeValue);
      if (c) {
        return { count: c.productCount, label: `~${c.productCount.toLocaleString()} products in "${c.title}"` };
      }
      return { count: 0, label: "Collection not found", error: true };
    }

    if (scopeType === "product") {
      return { count: 1, label: "1 specific product" };
    }

    if (scopeType === "tag") {
      // Can't know exact count without API call, give context instead
      return { count: null, label: `All products tagged "${scopeValue}"` };
    }

    return null;
  };

  const impact = getImpactPreview();

  const saveOverride = async () => {
    if (!scopeValue.trim()) {
      shopify.toast.show("Please select what this applies to", { isError: true });
      return;
    }

    // Validate collection exists
    if (scopeType === "collection") {
      const c = collections.find(c => c.handle === scopeValue);
      if (!c) {
        shopify.toast.show("Collection not found", { isError: true });
        return;
      }
      if (c.productCount === 0) {
        shopify.toast.show("This collection has no products", { isError: true });
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/app/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          override: {
            scopeType,
            scopeValue: scopeValue.trim(),
            mode: strategy,
            discount: strategy === "force" && discount ? Number(discount) : null,
            delay: strategy === "force" && delay ? Number(delay) : null,
            optimizationMode: strategy === "limit" ? optStyle : null
          }
        })
      });

      if (res.ok) {
        shopify.toast.show("Override saved!");
        setScopeValue("");
        setDiscount("");
        setDelay("");
        window.location.reload();
      }
    } catch (err) {
      shopify.toast.show("Error saving", { isError: true });
    }
    setSaving(false);
  };

  const deleteOverride = async (id) => {
    setDeleting(id);
    try {
      await fetch("/app/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id })
      });
      shopify.toast.show("Override deleted");
      window.location.reload();
    } catch (err) {
      shopify.toast.show("Error deleting", { isError: true });
      setDeleting(null);
    }
  };

  return (
    <s-page heading="Overrides">
      {/* Priority explanation */}
      <s-section>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-stack direction="block" gap="tight">
            <s-text variant="bodySmall">
              <strong>Priority:</strong> Product &gt; Collection &gt; Tag &gt; Global settings
            </s-text>
            <s-text variant="bodySmall" tone="subdued">
              Your store has {totalProducts.toLocaleString()} products. Use collections or tags to manage at scale.
            </s-text>
          </s-stack>
        </s-box>
      </s-section>

      {/* STEP 1: Scope */}
      <s-section>
        <s-stack direction="inline" gap="none" style={{ marginBottom: 8 }}>
          <s-text variant="headingSm">Step 1: Apply to</s-text>
          <Tooltip text="Product overrides beat collection overrides beat tag overrides. Most specific wins." />
        </s-stack>
        <s-stack direction="block" gap="tight" style={{ marginBottom: 12 }}>
          {["collection", "product", "tag"].map(type => {
            const info = SCOPE_INFO[type];
            return (
              <s-box
                key={type}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background={scopeType === type ? "success" : "transparent"}
                onClick={() => { setScopeType(type); setScopeValue(""); }}
                style={{ cursor: "pointer" }}
              >
                <s-stack direction="inline" gap="tight">
                  <input
                    type="radio"
                    checked={scopeType === type}
                    onChange={() => { setScopeType(type); setScopeValue(""); }}
                    style={{ marginRight: 8 }}
                  />
                  <s-stack direction="block" gap="none">
                    <s-text variant="bodyMd">{info.label}</s-text>
                    <s-text variant="bodySmall" tone="subdued">{info.hint}</s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>

        {/* Dynamic input based on scope type */}
        {scopeType === "collection" && (
          <>
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
                background: "#fff"
              }}
            >
              <option value="">Select a collection...</option>
              {collections.map(c => (
                <option key={c.id} value={c.handle}>
                  {c.title} ({c.productCount} products)
                </option>
              ))}
            </select>
            {scopeValue && impact && (
              <s-box padding="tight" background="info" borderRadius="base" style={{ marginTop: 8 }}>
                <s-text variant="bodySmall">
                  Applies to: <strong>{impact.label}</strong>
                </s-text>
              </s-box>
            )}
          </>
        )}

        {scopeType === "product" && (
          <>
            <input
              type="text"
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              placeholder={SCOPE_INFO.product.placeholder}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Find product handle in Shopify Admin → Products → [Product] → URL slug
            </s-text>
            {scopeValue && (
              <s-box padding="tight" background="info" borderRadius="base" style={{ marginTop: 8 }}>
                <s-text variant="bodySmall">
                  Applies to: <strong>1 specific product</strong>
                </s-text>
              </s-box>
            )}
          </>
        )}

        {scopeType === "tag" && (
          <>
            <input
              type="text"
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value.toLowerCase())}
              placeholder={SCOPE_INFO.tag.placeholder}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Tags are case-insensitive. This applies to ALL products with this tag across your store.
            </s-text>
            {scopeValue && (
              <s-box padding="tight" background="warning" borderRadius="base" style={{ marginTop: 8 }}>
                <s-text variant="bodySmall">
                  ⚠️ Applies to: <strong>All products tagged "{scopeValue}"</strong>
                </s-text>
              </s-box>
            )}
          </>
        )}
      </s-section>

      {/* STEP 2: Strategy */}
      <s-section heading="Step 2: Strategy">
        <s-stack direction="block" gap="tight">
          {Object.entries(STRATEGY_INFO).map(([key, info]) => (
            <s-box
              key={key}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background={strategy === key ? "success" : "transparent"}
              onClick={() => setStrategy(key)}
              style={{ cursor: "pointer" }}
            >
              <s-stack direction="inline" gap="tight">
                <input
                  type="radio"
                  checked={strategy === key}
                  onChange={() => setStrategy(key)}
                  style={{ marginRight: 8 }}
                />
                <s-stack direction="block" gap="none">
                  <s-text variant="bodyMd">
                    {info.label}
                    {info.recommended && <span style={{ marginLeft: 8, color: "#2e7d32", fontSize: 12 }}>(recommended)</span>}
                  </s-text>
                  <s-text variant="bodySmall" tone="subdued">{info.desc}</s-text>
                  {strategy === key && info.when && (
                    <s-text variant="bodySmall" style={{ color: "#666", fontStyle: "italic", marginTop: 4 }}>
                      {info.when}
                    </s-text>
                  )}
                </s-stack>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      {/* STEP 3: Configuration - contextual */}
      {strategy !== "off" && (
        <s-section heading="Step 3: Configuration">
          {strategy === "force" && (
            <s-stack direction="inline" gap="base">
              <s-box style={{ flex: 1 }}>
                <s-stack direction="inline" gap="none">
                  <s-text variant="bodySmall" tone="subdued">Discount (%)</s-text>
                  <Tooltip text="The exact discount shown on the banner. Higher = more conversions but less margin." />
                </s-stack>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder={String(defaults.discount)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                    marginTop: 4
                  }}
                />
              </s-box>
              <s-box style={{ flex: 1 }}>
                <s-stack direction="inline" gap="none">
                  <s-text variant="bodySmall" tone="subdued">Delay (ms)</s-text>
                  <Tooltip text="Wait time before showing the banner. 4000ms = 4 seconds. Shorter = more banners shown." />
                </s-stack>
                <input
                  type="number"
                  value={delay}
                  onChange={(e) => setDelay(e.target.value)}
                  placeholder={String(defaults.delay)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "14px",
                    marginTop: 4
                  }}
                />
              </s-box>
            </s-stack>
          )}

          {strategy === "limit" && (
            <s-stack direction="block" gap="tight">
              <s-stack direction="inline" gap="none">
                <s-text variant="bodySmall" tone="subdued">Optimization style</s-text>
                <Tooltip text="Controls how aggressively the system tries to convert. Affects delay timing and discount size." />
              </s-stack>
              <s-stack direction="inline" gap="tight">
                {Object.entries(OPT_STYLE_INFO).map(([key, info]) => (
                  <s-box
                    key={key}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background={optStyle === key ? "success" : "transparent"}
                    onClick={() => setOptStyle(key)}
                    style={{ cursor: "pointer", flex: 1, textAlign: "center" }}
                  >
                    <s-text variant="bodySm">{info.label}</s-text>
                  </s-box>
                ))}
              </s-stack>
              <s-text variant="bodySmall" tone="subdued" style={{ fontStyle: "italic" }}>
                {OPT_STYLE_INFO[optStyle].tooltip}
              </s-text>
            </s-stack>
          )}
        </s-section>
      )}

      {/* STEP 4: Preview */}
      {scopeValue && (
        <s-section heading="Step 4: Preview">
          <s-box padding="base" background="success" borderRadius="base">
            <s-text variant="headingSm">Final behavior</s-text>
            {strategy === "off" ? (
              <s-text variant="bodyMd">Nudge disabled for this {scopeType}</s-text>
            ) : (
              <s-stack direction="inline" gap="loose" style={{ marginTop: 8 }}>
                <s-text>Delay: <strong>{(preview.delay / 1000).toFixed(1)}s</strong></s-text>
                <s-text>Discount: <strong>{preview.discount}%</strong></s-text>
                <s-text>Mode: <strong>{preview.strategy}</strong></s-text>
              </s-stack>
            )}
          </s-box>
        </s-section>
      )}

      {/* Save button */}
      <s-section>
        <s-button
          variant="primary"
          onClick={saveOverride}
          {...(saving ? { loading: true } : {})}
          {...(!scopeValue ? { disabled: true } : {})}
        >
          Save Override
        </s-button>
      </s-section>

      {/* Current Overrides */}
      <s-section heading="Current Overrides">
        {overrides.length === 0 ? (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text>No overrides yet. Create one above.</s-text>
          </s-box>
        ) : (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd" }}>
                  <th style={{ textAlign: "left", padding: "8px" }}>Scope</th>
                  <th style={{ textAlign: "left", padding: "8px" }}>Target</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>Strategy</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>Config</th>
                  <th style={{ textAlign: "center", padding: "8px", width: "60px" }}></th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => {
                  const isDeleting = deleting === o.id;
                  const strategyInfo = STRATEGY_INFO[o.mode] || STRATEGY_INFO.limit;
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid #eee", opacity: isDeleting ? 0.5 : 1 }}>
                      <td style={{ padding: "8px" }}>
                        <s-text variant="bodySmall" tone="subdued" style={{ textTransform: "capitalize" }}>
                          {o.scopeType}
                        </s-text>
                      </td>
                      <td style={{ padding: "8px" }}>
                        <s-text variant="bodyMd">{getScopeLabel(o.scopeType, o.scopeValue)}</s-text>
                      </td>
                      <td style={{ textAlign: "center", padding: "8px" }}>
                        <s-text variant="bodySmall">{strategyInfo.label}</s-text>
                      </td>
                      <td style={{ textAlign: "center", padding: "8px" }}>
                        {o.mode === "off" ? (
                          <s-text variant="bodySmall" tone="subdued">—</s-text>
                        ) : o.mode === "force" ? (
                          <s-text variant="bodySmall">
                            {o.discount ?? defaults.discount}% / {((o.delay ?? defaults.delay) / 1000).toFixed(1)}s
                          </s-text>
                        ) : (
                          <s-text variant="bodySmall" style={{ textTransform: "capitalize" }}>
                            {o.optimizationMode || "balanced"}
                          </s-text>
                        )}
                      </td>
                      <td style={{ textAlign: "center", padding: "8px" }}>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          onClick={() => deleteOverride(o.id)}
                          {...(isDeleting ? { loading: true, disabled: true } : {})}
                        >
                          {isDeleting ? "..." : "✕"}
                        </s-button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
