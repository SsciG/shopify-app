import prisma from "../db.server";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production";

// Handle admin actions via GET request (easier with proxies)
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const shop = url.searchParams.get("shop");
  const actionType = url.searchParams.get("action");
  const plan = url.searchParams.get("plan");

  // Auth check
  if (key !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!shop) {
    return new Response(JSON.stringify({ error: "Missing shop" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    if (actionType === "activate") {
      await prisma.storeSettings.upsert({
        where: { shop },
        update: { isActive: true, plan: plan || "pro" },
        create: { shop, isActive: true, plan: plan || "pro" }
      });
      return new Response(JSON.stringify({ success: true, message: `Activated ${shop}` }), {
        headers: { "Content-Type": "application/json" }
      });
    } else if (actionType === "deactivate") {
      await prisma.storeSettings.update({
        where: { shop },
        data: { isActive: false }
      });
      return new Response(JSON.stringify({ success: true, message: `Deactivated ${shop}` }), {
        headers: { "Content-Type": "application/json" }
      });
    } else if (actionType === "delete") {
      await prisma.$transaction([
        prisma.event.deleteMany({ where: { shop } }),
        prisma.discountCode.deleteMany({ where: { shop } }),
        prisma.override.deleteMany({ where: { shop } }),
        prisma.storeSettings.delete({ where: { shop } })
      ]);
      return new Response(JSON.stringify({ success: true, message: `Deleted ${shop}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
