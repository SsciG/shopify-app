import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  await authenticate.admin(request);

  const body = await request.json();
  const { shop, config } = body;

  // Save to global config (shared with apps.nudge routes)
  if (!global.STORE_CONFIG) {
    global.STORE_CONFIG = {};
  }
  global.STORE_CONFIG[shop] = config;

  console.log("🔥 SETTINGS SAVED", { shop, config });

  return { success: true };
};

export default function Settings() {
  const shopify = useAppBridge();
  const [discount, setDiscount] = useState(10);
  const [delay, setDelay] = useState(4000);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const shop = shopify?.config?.shop || "the-app-4.myshopify.com";

    try {
      // Call our own Remix action to save config
      const res = await fetch("/app/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shop,
          config: { discount, delay, enabled },
        }),
      });

      if (res.ok) {
        shopify.toast.show("Settings saved!");
      } else {
        shopify.toast.show("Failed to save", { isError: true });
      }
    } catch (err) {
      shopify.toast.show("Error saving settings", { isError: true });
    }
    setSaving(false);
  };

  return (
    <s-page heading="Nudge Settings">
      <s-section heading="Configuration">
        <s-stack direction="block" gap="base">
          <s-box>
            <s-checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            >
              Enable Nudge Banner
            </s-checkbox>
          </s-box>

          <s-box>
            <s-text-field
              label="Discount (%)"
              type="number"
              value={String(discount)}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </s-box>

          <s-box>
            <s-text-field
              label="Delay (ms)"
              type="number"
              value={String(delay)}
              onChange={(e) => setDelay(Number(e.target.value))}
            />
          </s-box>

          <s-button
            variant="primary"
            onClick={save}
            {...(saving ? { loading: true } : {})}
          >
            Save Settings
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
