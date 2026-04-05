// DEPRECATED: ScriptTag API is replaced by Theme App Extension
// This route can be used to remove old ScriptTags if needed

import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Remove all old script tags (cleanup from ScriptTag API)
  try {
    const response = await admin.graphql(`
      query {
        scriptTags(first: 50) {
          edges {
            node {
              id
              src
            }
          }
        }
      }
    `);

    const data = await response.json();
    const scriptTags = data.data?.scriptTags?.edges || [];

    // Delete all script tags
    for (const edge of scriptTags) {
      await admin.graphql(`
        mutation scriptTagDelete($id: ID!) {
          scriptTagDelete(id: $id) {
            deletedScriptTagId
          }
        }
      `, {
        variables: { id: edge.node.id }
      });
      console.log("🗑️ Removed old ScriptTag:", edge.node.src);
    }

    return new Response(JSON.stringify({
      message: "DEPRECATED: ScriptTag API has been replaced by Theme App Extension.",
      action: "Removed old ScriptTags. Enable the Theme App Extension in your theme settings.",
      removed: scriptTags.length,
      nextSteps: [
        "1. Go to Online Store → Themes → Customize",
        "2. Click 'App embeds' in the left sidebar",
        "3. Enable 'Nudge Banner'",
        "4. Save"
      ]
    }, null, 2), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
