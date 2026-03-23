import { useState, useMemo } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Mode descriptions
const MODE_INFO = {
  force: { icon: "🔒", label: "Fixed", desc: "Use exact values you set" },
  limit: { icon: "🎯", label: "Guided", desc: "AI learns within your limits" },
  off: { icon: "🚫", label: "Disabled", desc: "No nudge for this product" }
};

const OPT_MODE_INFO = {
  "": { label: "Global", desc: "Use store default" },
  aggressive: { label: "Aggressive", desc: "-1s delay, +3% discount" },
  balanced: { label: "Balanced", desc: "No adjustment" },
  safe: { label: "Safe", desc: "+1s delay, -3% discount" }
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const overrides = await prisma.productOverride.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" }
  });

  // Fetch products for dropdown
  const productsResponse = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `);
  const productsData = await productsResponse.json();
  const products = productsData.data?.products?.edges?.map(e => ({
    id: e.node.id.replace("gid://shopify/Product/", ""),
    title: e.node.title,
    handle: e.node.handle
  })) || [];

  return { shop, overrides, products };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json();
  const { action, productId, override } = body;

  if (action === "save") {
    await prisma.productOverride.upsert({
      where: { shop_productId: { shop, productId } },
      update: override,
      create: { shop, productId, ...override }
    });
    console.log("🔥 OVERRIDE SAVED", { shop, productId, override });
    return { success: true };
  }

  if (action === "delete") {
    await prisma.productOverride.deleteMany({
      where: { shop, productId }
    });
    console.log("🔥 OVERRIDE DELETED", { shop, productId });
    return { success: true };
  }

  return { success: false };
};

export default function Overrides() {
  const { overrides, products } = useLoaderData();
  const shopify = useAppBridge();

  const [newProductId, setNewProductId] = useState("");
  const [newDiscount, setNewDiscount] = useState("");
  const [newDelay, setNewDelay] = useState("");
  const [newMode, setNewMode] = useState("force");
  const [newOptMode, setNewOptMode] = useState("");
  const [newForceShow, setNewForceShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null); // track which product is being deleted
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Calculate effective preview
  const effectivePreview = useMemo(() => {
    const baseDelay = 4000; // Default
    const baseDiscount = 10; // Default

    let delay = newDelay ? Number(newDelay) : baseDelay;
    let discount = newDiscount ? Number(newDiscount) : baseDiscount;

    // Apply optimization mode adjustments
    if (newOptMode === "aggressive") {
      delay -= 1000;
      discount += 3;
    } else if (newOptMode === "safe") {
      delay += 1000;
      discount -= 3;
    }

    return {
      delay: Math.max(1000, delay),
      discount: Math.max(0, Math.min(100, discount)),
      mode: MODE_INFO[newMode]
    };
  }, [newDelay, newDiscount, newOptMode, newMode]);

  const saveOverride = async () => {
    if (!newProductId.trim()) {
      shopify.toast.show("Product ID required", { isError: true });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/app/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          productId: newProductId.trim(),
          override: {
            discount: newDiscount ? Number(newDiscount) : null,
            delay: newDelay ? Number(newDelay) : null,
            mode: newMode,
            optimizationMode: newOptMode || null,
            forceShow: newForceShow
          }
        })
      });

      if (res.ok) {
        shopify.toast.show("Override saved!");
        setNewProductId("");
        setNewDiscount("");
        setNewDelay("");
        // Reload page to show new override
        window.location.reload();
      }
    } catch (err) {
      shopify.toast.show("Error saving", { isError: true });
    }
    setSaving(false);
  };

  const deleteOverride = async (productId) => {
    setDeleting(productId);
    try {
      await fetch("/app/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", productId })
      });
      shopify.toast.show("Override deleted");
      window.location.reload();
    } catch (err) {
      shopify.toast.show("Error deleting", { isError: true });
      setDeleting(null);
    }
  };

  return (
    <s-page heading="Product Overrides">
      {/* When to use overrides */}
      <s-section>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-text variant="headingSm">When to use overrides?</s-text>
          <s-text variant="bodySmall">• Product has different margins • Conversion behavior differs • Testing a strategy • High-value item needs special treatment</s-text>
        </s-box>
      </s-section>

      <s-section heading="Add Override">
        <s-stack direction="block" gap="base">
          {/* Product selector */}
          <s-box>
            <s-text variant="bodyMd">Select Product</s-text>
            <select
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                marginTop: 4,
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
                background: "#fff"
              }}
            >
              <option value="">-- Select a product --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Or enter manually:
            </s-text>
            <input
              type="text"
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              placeholder="Product ID or handle"
              style={{
                width: "100%",
                padding: "6px 10px",
                marginTop: 4,
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "13px"
              }}
            />
          </s-box>

          {/* Mode selector - visual */}
          <s-box>
            <s-text variant="bodyMd">Override Mode</s-text>
            <s-stack direction="inline" gap="tight" style={{ marginTop: 8 }}>
              {Object.entries(MODE_INFO).map(([key, info]) => (
                <s-box
                  key={key}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={newMode === key ? "success" : "transparent"}
                  onClick={() => setNewMode(key)}
                  style={{ cursor: "pointer", flex: 1, textAlign: "center" }}
                >
                  <s-text variant="headingMd">{info.icon}</s-text>
                  <s-text variant="bodySm">{info.label}</s-text>
                </s-box>
              ))}
            </s-stack>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              {MODE_INFO[newMode].desc}
            </s-text>
          </s-box>

          {/* Discount/Delay - only if not "off" */}
          {newMode !== "off" && (
            <s-stack direction="inline" gap="base">
              <s-text-field
                label="Discount (%)"
                type="number"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
                placeholder="Auto"
                style={{ flex: 1 }}
              />
              <s-text-field
                label="Delay (ms)"
                type="number"
                value={newDelay}
                onChange={(e) => setNewDelay(e.target.value)}
                placeholder="Auto"
                style={{ flex: 1 }}
              />
            </s-stack>
          )}

          {/* Effective Result Preview */}
          {newMode !== "off" && (newDiscount || newDelay || newOptMode) && (
            <s-box padding="base" background="success" borderRadius="base">
              <s-text variant="headingSm">Effective Result</s-text>
              <s-stack direction="inline" gap="loose">
                <s-text>Delay: <strong>{(effectivePreview.delay / 1000).toFixed(1)}s</strong></s-text>
                <s-text>Discount: <strong>{effectivePreview.discount}%</strong></s-text>
                <s-text>Mode: <strong>{effectivePreview.mode.label}</strong></s-text>
              </s-stack>
            </s-box>
          )}

          {/* Advanced options - collapsible */}
          {newMode !== "off" && (
            <s-box>
              <s-button
                variant="tertiary"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? "▼" : "▶"} Advanced Settings
              </s-button>

              {showAdvanced && (
                <s-stack direction="block" gap="base" style={{ marginTop: 12, paddingLeft: 16 }}>
                  <s-box>
                    <s-text variant="bodyMd">Optimization Mode</s-text>
                    <s-stack direction="inline" gap="tight" style={{ marginTop: 4 }}>
                      {Object.entries(OPT_MODE_INFO).map(([key, info]) => (
                        <s-button
                          key={key}
                          variant={newOptMode === key ? "primary" : "tertiary"}
                          onClick={() => setNewOptMode(key)}
                        >
                          {info.label}
                        </s-button>
                      ))}
                    </s-stack>
                    <s-text variant="bodySmall" tone="subdued">
                      {OPT_MODE_INFO[newOptMode].desc}
                    </s-text>
                  </s-box>

                  <s-checkbox
                    checked={newForceShow}
                    onChange={(e) => setNewForceShow(e.target.checked)}
                  >
                    Force show (bypass trigger conditions)
                  </s-checkbox>
                </s-stack>
              )}
            </s-box>
          )}

          <s-button
            variant="primary"
            onClick={saveOverride}
            {...(saving ? { loading: true } : {})}
          >
            Save Override
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Current Overrides">
        {overrides.length === 0 ? (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text>No product overrides yet. Add one above.</s-text>
          </s-box>
        ) : (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd" }}>
                  <th style={{ textAlign: "left", padding: "8px" }}>Product</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>Mode</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>Discount</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>Delay</th>
                  <th style={{ textAlign: "center", padding: "8px", width: "60px" }}></th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => {
                  const mode = MODE_INFO[o.mode] || MODE_INFO.force;
                  const isDeleting = deleting === o.productId;
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid #eee", opacity: isDeleting ? 0.5 : 1 }}>
                      <td style={{ padding: "8px" }}>
                        <s-text variant="bodyMd">{o.productId}</s-text>
                      </td>
                      <td style={{ textAlign: "center", padding: "8px" }}>
                        <span title={mode.desc}>{mode.icon} {mode.label}</span>
                      </td>
                      <td style={{ textAlign: "center", padding: "8px" }}>
                        {o.mode === "off" ? "—" : (o.discount !== null ? `${o.discount}%` : "Auto")}
                      </td>
                      <td style={{ textAlign: "center", padding: "8px" }}>
                        {o.mode === "off" ? "—" : (o.delay !== null ? `${(o.delay/1000).toFixed(1)}s` : "Auto")}
                      </td>
                      <td style={{ textAlign: "center", padding: "8px" }}>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          onClick={() => deleteOverride(o.productId)}
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
