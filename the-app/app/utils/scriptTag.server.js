// Utility to manage ScriptTag injection

export async function ensureScriptTagInstalled(admin, appUrl) {
  try {
    // Check if script tag already exists
    const existingResponse = await admin.graphql(`
      query {
        scriptTags(first: 10) {
          edges {
            node {
              id
              src
            }
          }
        }
      }
    `);

    const existingData = await existingResponse.json();
    const scriptTags = existingData.data?.scriptTags?.edges || [];

    const scriptUrl = `${appUrl}/nudge-script.js`;
    const alreadyInstalled = scriptTags.some(
      (edge) => edge.node.src === scriptUrl
    );

    if (alreadyInstalled) {
      console.log("🔥 ScriptTag already installed");
      return { installed: true, alreadyExisted: true };
    }

    // Create the script tag
    const createResponse = await admin.graphql(`
      mutation scriptTagCreate($input: ScriptTagInput!) {
        scriptTagCreate(input: $input) {
          scriptTag {
            id
            src
          }
          userErrors {
            field
            message
          }
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

    if (createData.data?.scriptTagCreate?.userErrors?.length > 0) {
      console.error("ScriptTag creation errors:", createData.data.scriptTagCreate.userErrors);
      return { installed: false, errors: createData.data.scriptTagCreate.userErrors };
    }

    console.log("🔥 ScriptTag installed:", createData.data?.scriptTagCreate?.scriptTag);
    return { installed: true, alreadyExisted: false };

  } catch (err) {
    console.error("ScriptTag installation error:", err);
    return { installed: false, error: err.message };
  }
}

export async function removeAllScriptTags(admin, appUrl) {
  try {
    // Get all script tags
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

    // Filter to only our app's script tags
    const ourScriptTags = scriptTags.filter(
      (edge) => edge.node.src.includes(appUrl)
    );

    // Delete each one
    for (const edge of ourScriptTags) {
      await admin.graphql(`
        mutation scriptTagDelete($id: ID!) {
          scriptTagDelete(id: $id) {
            deletedScriptTagId
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: { id: edge.node.id }
      });
      console.log("🔥 ScriptTag removed:", edge.node.id);
    }

    return { removed: ourScriptTags.length };

  } catch (err) {
    console.error("ScriptTag removal error:", err);
    return { removed: 0, error: err.message };
  }
}
