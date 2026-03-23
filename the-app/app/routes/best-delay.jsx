// Compute best delay+discount combo based on conversion rates
// URL: /apps/nudge/best-delay (via app proxy)

import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const defaultDelay = parseInt(url.searchParams.get("defaultDelay")) || 4000;
  const defaultDiscount = parseInt(url.searchParams.get("defaultDiscount")) || 10;

  const events = await prisma.event.findMany({
    where: {
      delay: { not: null },
      discount: { not: null }
    }
  });

  // Track combos: "delay_discount" -> { shown, clicked }
  const stats = {};

  for (const e of events) {
    const delay = e.delay;
    const discount = e.discount;
    if (!delay || !discount) continue;

    const key = `${delay}_${discount}`;

    if (!stats[key]) {
      stats[key] = { delay, discount, shown: 0, clicked: 0 };
    }

    if (e.event === "banner_shown") stats[key].shown++;
    if (e.event === "banner_clicked") stats[key].clicked++;
  }

  let bestCombo = null;
  let bestRate = 0;

  for (const key in stats) {
    const s = stats[key];

    // Need minimum 20 samples to avoid noise
    if (s.shown < 20) continue;

    const rate = s.clicked / s.shown;

    if (rate > bestRate) {
      bestRate = rate;
      bestCombo = { delay: s.delay, discount: s.discount };
    }
  }

  // Fallback to defaults if no good combo exists
  if (!bestCombo) {
    console.log("📊 BEST COMBO: none found, using defaults");
    return new Response(JSON.stringify({
      bestDelay: null,
      bestDiscount: null,
      bestRate: null,
      fallback: true,
      defaultDelay,
      defaultDiscount,
      stats
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  console.log("📊 BEST COMBO:", bestCombo.delay, "ms +", bestCombo.discount, "% | rate:", (bestRate * 100).toFixed(1) + "%");

  return new Response(JSON.stringify({
    bestDelay: bestCombo.delay,
    bestDiscount: bestCombo.discount,
    bestRate: (bestRate * 100).toFixed(1),
    fallback: false,
    stats
  }), {
    headers: { "Content-Type": "application/json" }
  });
};
