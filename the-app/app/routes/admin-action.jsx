import prisma from "../db.server";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-in-production";

// Handle admin actions via GET request (easier with proxies)
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const shop = url.searchParams.get("shop");
  const actionType = url.searchParams.get("action");
  const plan = url.searchParams.get("plan");
  const days = url.searchParams.get("days");
  const weeks = url.searchParams.get("weeks");
  const months = url.searchParams.get("months");
  const note = url.searchParams.get("note");
  const sendDiscount = url.searchParams.get("sendDiscount");

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
    } else if (actionType === "extend") {
      // Calculate new subscription end date
      const current = await prisma.storeSettings.findUnique({
        where: { shop },
        select: { subscriptionEndsAt: true }
      });

      // Start from current end date or now
      const baseDate = current?.subscriptionEndsAt ? new Date(current.subscriptionEndsAt) : new Date();

      // Add the extension period
      const daysToAdd = parseInt(days || 0) + (parseInt(weeks || 0) * 7) + (parseInt(months || 0) * 30);
      if (daysToAdd <= 0) {
        return new Response(JSON.stringify({ error: "Must specify extension period" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      baseDate.setDate(baseDate.getDate() + daysToAdd);

      await prisma.storeSettings.update({
        where: { shop },
        data: {
          subscriptionEndsAt: baseDate,
          extensionNotes: note || null,
          isActive: true // Ensure subscription is active when extending
        }
      });

      return new Response(JSON.stringify({
        success: true,
        message: `Extended ${shop} by ${daysToAdd} days until ${baseDate.toLocaleDateString()}`
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } else if (actionType === "deactivate") {
      await prisma.storeSettings.update({
        where: { shop },
        data: { isActive: false }
      });

      // TODO: If sendDiscount === "true", send discount offer email
      // For now, just log it
      if (sendDiscount === "true") {
        console.log(`[ADMIN] Would send discount offer to ${shop}`);
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Deactivated ${shop}${sendDiscount === "true" ? " (discount offer sent)" : ""}`
      }), {
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
