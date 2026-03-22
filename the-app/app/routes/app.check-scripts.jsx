import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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

  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
};
