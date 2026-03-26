import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const reinstall = url.searchParams.get("reinstall") === "1";

  // Get current script tags
  const response = await admin.graphql(`
    query {
      scriptTags(first: 20) {
        edges {
          node {
            id
            src
            displayScope
            createdAt
          }
        }
      }
    }
  `);

  const data = await response.json();
  const scriptTags = data.data?.scriptTags?.edges || [];

  // If reinstall requested, remove old and add new
  if (reinstall) {
    const appUrl = process.env.SHOPIFY_APP_URL;

    // Remove ALL existing script tags for this app
    for (const edge of scriptTags) {
      try {
        await admin.graphql(`
          mutation scriptTagDelete($id: ID!) {
            scriptTagDelete(id: $id) {
              deletedScriptTagId
              userErrors { field message }
            }
          }
        `, { variables: { id: edge.node.id } });
        console.log("🗑️ Removed script tag:", edge.node.id);
      } catch (err) {
        console.error("Failed to remove:", err);
      }
    }

    // Install new script tag with current tunnel URL
    const scriptUrl = `${appUrl}/nudge-script.js?v=${Date.now()}`;
    try {
      const createResponse = await admin.graphql(`
        mutation scriptTagCreate($input: ScriptTagInput!) {
          scriptTagCreate(input: $input) {
            scriptTag { id src }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            src: scriptUrl,
            displayScope: "ONLINE_STORE"
          }
        }
      });
      const createData = await createResponse.json();
      console.log("✅ Installed script tag:", createData.data?.scriptTagCreate?.scriptTag);

      return new Response(JSON.stringify({
        action: "reinstalled",
        removed: scriptTags.length,
        installed: createData.data?.scriptTagCreate?.scriptTag,
        newUrl: scriptUrl,
        message: "Script tag reinstalled! Refresh your store to test."
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        action: "error",
        error: err.message
      }, null, 2), {
        headers: { "Content-Type": "application/json" },
        status: 500
      });
    }
  }

  // Just show current state
  return new Response(JSON.stringify({
    currentScriptTags: scriptTags.map(e => e.node),
    currentTunnelUrl: process.env.SHOPIFY_APP_URL,
    hint: "Add ?reinstall=1 to this URL to reinstall script tags with current tunnel"
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
};
