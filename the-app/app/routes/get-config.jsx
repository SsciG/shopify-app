// Shared config storage
if (!global.STORE_CONFIG) {
  global.STORE_CONFIG = {};
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response(JSON.stringify({ error: "missing shop" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const config = global.STORE_CONFIG[shop] || {
    enabled: true,
    discount: 10,
    delay: 4000
  };

  console.log("🔥 GET-CONFIG", { shop, config });

  return new Response(JSON.stringify(config), {
    headers: { "Content-Type": "application/json" }
  });
};
