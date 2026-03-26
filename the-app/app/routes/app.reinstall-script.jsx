import { authenticate } from "../shopify.server";
import { removeAllScriptTags, ensureScriptTagInstalled } from "../utils/scriptTag.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get app URL from request (the tunnel URL changes each restart)
  const url = new URL(request.url);
  // In dev, the app proxy URL is different from the request URL
  // We need to use the SHOPIFY_APP_URL env var which is set by shopify app dev
  const appUrl = process.env.SHOPIFY_APP_URL;

  // Step 1: Remove old script tags
  const removeResult = await removeAllScriptTags(admin, appUrl);
  console.log("Removed script tags:", removeResult);

  // Step 2: Install new script tag (with version param)
  const installResult = await ensureScriptTagInstalled(admin, appUrl);
  console.log("Installed script tag:", installResult);

  return new Response(JSON.stringify({
    removed: removeResult,
    installed: installResult,
    message: "Script tag reinstalled with cache-busting version. Refresh your store."
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
};
