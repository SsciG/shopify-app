import prisma from "../db.server";

export const loader = async ({ request }) => {
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

    // Save to database (single source of truth)
    await prisma.storeSettings.upsert({
      where: { shop },
      update: config,
      create: { shop, ...config }
    });

    console.log("Settings saved:", { shop, config });

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
