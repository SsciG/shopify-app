// Shared config storage
if (!global.STORE_CONFIG) {
  global.STORE_CONFIG = {};
}

export const loader = async ({ request }) => {
  // Handle GET requests (shouldn't happen, but just in case)
  return new Response(JSON.stringify({ error: "use POST" }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};

export const action = async ({ request }) => {
  try {
    const body = await request.json();
    const { shop, config } = body;

    if (!shop) {
      return new Response(JSON.stringify({ error: "missing shop" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    global.STORE_CONFIG[shop] = config;

    console.log("🔥 SAVE-CONFIG", { shop, config });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("SAVE-CONFIG ERROR:", err);
    return new Response(JSON.stringify({ error: "failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
