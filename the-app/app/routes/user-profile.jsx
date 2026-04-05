// DEPRECATED: This endpoint used a userMetrics model that no longer exists.
// Keeping endpoint alive to avoid errors if old script.js is still deployed.
// The new nudge-script[.]js.jsx does NOT use this endpoint.

export const loader = async () => {
  // Return safe fallback - no personalization, no errors
  return new Response(JSON.stringify({ exists: false }), {
    headers: { "Content-Type": "application/json" }
  });
};
