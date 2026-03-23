import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useLoaderData } from "react-router";

// Helper to safely extract count from Prisma groupBy result
// Prisma returns _count as { _all: number } or just number depending on version
const getCount = (item) => {
  if (!item?._count) return 0;
  return typeof item._count === 'number' ? item._count : (item._count._all || 0);
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;  // CRITICAL: scope all queries by shop

  // Total sessions for THIS shop
  const totalSessions = await prisma.event.groupBy({
    by: ["sessionId"],
    where: { shop }
  }).then(r => r.length);

  // Event breakdown for THIS shop
  const eventCounts = await prisma.event.groupBy({
    by: ["event"],
    where: { shop },
    _count: { _all: true }
  });

  // Eligibility tracking - the full funnel
  const totalEligible = getCount(eventCounts.find(e => e.event === "trigger_eligible"));

  // Trigger type performance - THE KEY METRIC
  const triggerShown = await prisma.event.groupBy({
    by: ["triggerType"],
    where: { shop, event: "banner_shown", triggerType: { not: null } },
    _count: { _all: true }
  });

  const triggerClicked = await prisma.event.groupBy({
    by: ["triggerType"],
    where: { shop, event: "banner_clicked", triggerType: { not: null } },
    _count: { _all: true }
  });

  const triggerConverted = await prisma.event.groupBy({
    by: ["triggerType"],
    where: { shop, event: "converted", triggerType: { not: null } },
    _count: { _all: true }
  });

  // Get discount code stats for THIS shop
  const discountStats = await prisma.discountCode.groupBy({
    by: ["triggerType"],
    where: { shop, used: true },
    _count: { _all: true },
    _sum: { orderTotal: true }
  });

  // Build trigger performance map with CONVERSIONS
  const triggerPerformance = {};
  for (const t of triggerShown) {
    const shownCount = getCount(t);
    triggerPerformance[t.triggerType] = {
      shown: shownCount,
      clicked: 0,
      converted: 0,
      revenue: 0,
      ctr: 0,
      conversionRate: 0
    };
  }
  for (const t of triggerClicked) {
    if (triggerPerformance[t.triggerType]) {
      const clickedCount = getCount(t);
      triggerPerformance[t.triggerType].clicked = clickedCount;
      triggerPerformance[t.triggerType].ctr =
        ((clickedCount / triggerPerformance[t.triggerType].shown) * 100).toFixed(1);
    }
  }
  for (const t of triggerConverted) {
    if (triggerPerformance[t.triggerType]) {
      const convertedCount = getCount(t);
      triggerPerformance[t.triggerType].converted = convertedCount;
      triggerPerformance[t.triggerType].conversionRate =
        ((convertedCount / triggerPerformance[t.triggerType].shown) * 100).toFixed(1);
    }
  }
  for (const d of discountStats) {
    if (d.triggerType && triggerPerformance[d.triggerType]) {
      triggerPerformance[d.triggerType].revenue = d._sum?.orderTotal || 0;
    }
  }

  // Total conversions
  const totalConverted = getCount(eventCounts.find(e => e.event === "converted"));
  const totalRevenue = await prisma.discountCode.aggregate({
    where: { shop, used: true },
    _sum: { orderTotal: true }
  });

  // Control group analysis - THE KEY CAUSATION METRIC
  // Now tracks BOTH treatment and control conversions with revenue
  const controlShown = await prisma.event.count({
    where: { shop, event: "banner_shown", decisionSource: "control" }
  });
  const controlClicked = await prisma.event.count({
    where: { shop, event: "banner_clicked", decisionSource: "control" }
  });
  const controlConverted = await prisma.event.count({
    where: { shop, event: "converted", decisionSource: "control" }
  });
  const controlRevenue = await prisma.event.aggregate({
    where: { shop, event: "converted", decisionSource: "control" },
    _sum: { orderTotal: true }
  });
  const treatmentShown = await prisma.event.count({
    where: { shop, event: "banner_shown", decisionSource: "treatment" }
  });
  const treatmentClicked = await prisma.event.count({
    where: { shop, event: "banner_clicked", decisionSource: "treatment" }
  });
  const treatmentConverted = await prisma.event.count({
    where: { shop, event: "converted", decisionSource: "treatment" }
  });
  const treatmentRevenue = await prisma.event.aggregate({
    where: { shop, event: "converted", decisionSource: "treatment" },
    _sum: { orderTotal: true }
  });

  const controlGroupStats = {
    control: {
      shown: controlShown,
      clicked: controlClicked,
      converted: controlConverted,
      revenue: controlRevenue._sum?.orderTotal || 0,
      ctr: controlShown > 0 ? ((controlClicked / controlShown) * 100).toFixed(1) : 0,
      conversionRate: controlShown > 0 ? ((controlConverted / controlShown) * 100).toFixed(1) : 0,
      avgOrderValue: controlConverted > 0 ? ((controlRevenue._sum?.orderTotal || 0) / controlConverted).toFixed(2) : 0
    },
    treatment: {
      shown: treatmentShown,
      clicked: treatmentClicked,
      converted: treatmentConverted,
      revenue: treatmentRevenue._sum?.orderTotal || 0,
      ctr: treatmentShown > 0 ? ((treatmentClicked / treatmentShown) * 100).toFixed(1) : 0,
      conversionRate: treatmentShown > 0 ? ((treatmentConverted / treatmentShown) * 100).toFixed(1) : 0,
      avgOrderValue: treatmentConverted > 0 ? ((treatmentRevenue._sum?.orderTotal || 0) / treatmentConverted).toFixed(2) : 0
    }
  };

  // Recent events for THIS shop
  const recentEvents = await prisma.event.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  // Calculate funnel metrics
  const shown = getCount(eventCounts.find(e => e.event === "banner_shown"));
  const clicked = getCount(eventCounts.find(e => e.event === "banner_clicked"));
  const closed = getCount(eventCounts.find(e => e.event === "banner_closed"));

  const conversionRate = shown > 0 ? ((clicked / shown) * 100).toFixed(1) : 0;

  return {
    totalSessions,
    totalEligible,
    triggerPerformance,
    controlGroupStats,
    conversionRate,
    shown,
    clicked,
    closed,
    totalConverted,
    totalRevenue: totalRevenue._sum?.orderTotal || 0,
    recentEvents: recentEvents.map(e => ({
      ...e,
      ts: e.ts.toString()
    }))
  };
};

export default function Analytics() {
  const {
    totalEligible,
    triggerPerformance,
    controlGroupStats,
    shown,
    clicked,
    totalConverted,
    totalRevenue,
    recentEvents
  } = useLoaderData();

  // Calculate rates and drop-offs
  const showRate = totalEligible > 0 ? ((shown / totalEligible) * 100) : 0;
  const clickRate = shown > 0 ? ((clicked / shown) * 100) : 0;

  // Find biggest drop-off
  const dropOffs = [
    { stage: "Eligible → Shown", drop: 100 - showRate, from: "eligible", to: "shown" },
    { stage: "Shown → Clicked", drop: 100 - clickRate, from: "shown", to: "clicked" },
  ];
  const biggestDrop = dropOffs.reduce((a, b) => a.drop > b.drop ? a : b);

  // Find best and worst triggers
  const triggerEntries = Object.entries(triggerPerformance);
  const sortedTriggers = [...triggerEntries].sort((a, b) => b[1].conversionRate - a[1].conversionRate);
  const bestTrigger = sortedTriggers[0];
  const worstTrigger = sortedTriggers.length > 1 ? sortedTriggers[sortedTriggers.length - 1] : null;

  // Calculate discount lift
  const treatmentRate = parseFloat(controlGroupStats.treatment.conversionRate) || 0;
  const controlRate = parseFloat(controlGroupStats.control.conversionRate) || 0;
  const discountLift = controlRate > 0 ? ((treatmentRate - controlRate) / controlRate * 100) : 0;

  // Generate action recommendations
  const getActions = () => {
    const actions = [];

    if (bestTrigger && bestTrigger[1].conversionRate > 3) {
      actions.push({
        type: "success",
        text: `✓ ${formatTrigger(bestTrigger[0])} is your best trigger (${bestTrigger[1].conversionRate.toFixed(1)}% CVR). Consider increasing its weight.`
      });
    }

    if (worstTrigger && worstTrigger[1].shown >= 10 && worstTrigger[1].conversionRate < 1) {
      actions.push({
        type: "warning",
        text: `⚠ ${formatTrigger(worstTrigger[0])} underperforms (${worstTrigger[1].conversionRate.toFixed(1)}% CVR). Consider disabling it.`
      });
    }

    if (discountLift > 20) {
      actions.push({
        type: "success",
        text: `✓ Discounts are highly effective (+${discountLift.toFixed(0)}% lift). Current strategy is working.`
      });
    } else if (discountLift < 5 && controlGroupStats.treatment.shown > 20) {
      actions.push({
        type: "info",
        text: `💡 Discounts show minimal impact (+${discountLift.toFixed(0)}%). Try reducing discount % to protect margins.`
      });
    }

    if (biggestDrop.drop > 50 && shown > 20) {
      if (biggestDrop.to === "shown") {
        actions.push({
          type: "warning",
          text: `⚠ ${biggestDrop.drop.toFixed(0)}% drop from Eligible→Shown. Banner may be suppressed too often.`
        });
      } else if (biggestDrop.to === "clicked") {
        actions.push({
          type: "warning",
          text: `⚠ ${biggestDrop.drop.toFixed(0)}% drop from Shown→Clicked. Banner copy/design may need improvement.`
        });
      }
    }

    if (actions.length === 0 && shown < 50) {
      actions.push({
        type: "info",
        text: `📊 Need more data. ${shown}/50 impressions collected.`
      });
    }

    return actions;
  };

  const formatTrigger = (trigger) => {
    const labels = {
      post_cart_idle: "Post-Cart Hesitation",
      hesitation: "Variant Comparison",
      deep_scroll: "Deep Scroll",
      idle: "Time on Page"
    };
    return labels[trigger] || trigger;
  };

  const actions = getActions();

  // Visual bar component
  const FunnelBar = ({ label, value, max, color = "#4CAF50" }) => {
    const pct = max > 0 ? (value / max * 100) : 0;
    return (
      <s-stack direction="block" gap="none">
        <s-stack direction="inline" gap="tight">
          <s-text style={{ width: "100px" }}>{label}</s-text>
          <div style={{ flex: 1, background: "#eee", borderRadius: 4, height: 20, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, background: color, height: "100%" }} />
          </div>
          <s-text style={{ width: "80px", textAlign: "right" }}>{value} ({pct.toFixed(0)}%)</s-text>
        </s-stack>
      </s-stack>
    );
  };

  // Color system (consistent across app)
  // GREEN (#2e7d32 / success) = making money
  // RED (#c62828 / critical) = losing money
  // YELLOW (#f57c00 / warning) = uncertain/needs attention
  // GRAY (subdued) = no data

  // Calculate confidence level
  const getConfidence = () => {
    const total = controlGroupStats.treatment.shown + controlGroupStats.control.shown;
    if (total > 100) return { level: "High", color: "success" };  // green - reliable data
    if (total > 30) return { level: "Medium", color: "warning" }; // yellow - uncertain
    return { level: "Low", color: "critical" };                    // red - unreliable
  };
  const confidence = getConfidence();

  return (
    <s-page heading="Nudge Analytics">
      {/* Priority Action - single most important thing */}
      {actions.length > 0 && (
        <s-section heading="🔥 Priority Action">
          <s-box
            padding="base"
            borderRadius="base"
            background={actions[0].type === "warning" ? "warning" : actions[0].type === "success" ? "success" : "subdued"}
          >
            <s-text variant="headingSm">{actions[0].text}</s-text>
          </s-box>
        </s-section>
      )}

      {/* Executive Summary - THE KEY */}
      <s-section heading="📊 Summary">
        <s-text variant="bodySmall" tone="subdued" style={{ marginBottom: 8 }}>Data from all time (since app install)</s-text>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="tight">
            {bestTrigger && (
              <s-text>• Best trigger: <strong>{formatTrigger(bestTrigger[0])}</strong> ({bestTrigger[1].conversionRate.toFixed(1)}% CVR)</s-text>
            )}
            {discountLift !== 0 && (
              <s-text>• Discount {discountLift > 0 ? "increases" : "decreases"} conversions by <strong style={{ color: discountLift > 0 ? "#2e7d32" : "#c62828" }}>{discountLift > 0 ? "+" : ""}{discountLift.toFixed(0)}%</strong></s-text>
            )}
            {worstTrigger && worstTrigger[1].conversionRate < bestTrigger[1].conversionRate * 0.5 && (
              <s-text>• {formatTrigger(worstTrigger[0])} is underperforming (<strong style={{ color: "#f57c00" }}>{((worstTrigger[1].conversionRate / bestTrigger[1].conversionRate - 1) * 100).toFixed(0)}%</strong> vs best)</s-text>
            )}
            <s-text>• Total revenue: <strong style={{ color: "#2e7d32" }}>${totalRevenue.toFixed(2)}</strong> from {totalConverted} conversions</s-text>
          </s-stack>
        </s-box>

        {/* Trigger Weight Suggestion */}
        {bestTrigger && sortedTriggers.length > 1 && (
          <s-box padding="base" background="subdued" borderRadius="base" style={{ marginTop: 8 }}>
            <s-text variant="bodySmall">
              <strong>Suggested trigger priority:</strong>{" "}
              {sortedTriggers.map(([type], idx) => (
                <span key={type}>
                  {formatTrigger(type)} → {idx === 0 ? "High" : idx === sortedTriggers.length - 1 ? "Low" : "Medium"}
                  {idx < sortedTriggers.length - 1 ? " | " : ""}
                </span>
              ))}
            </s-text>
          </s-box>
        )}
      </s-section>

      {/* Action Recommendations */}
      {actions.length > 0 && (
        <s-section heading="🚀 Suggested Actions">
          <s-stack direction="block" gap="tight">
            {actions.map((action, i) => (
              <s-box
                key={i}
                padding="base"
                borderRadius="base"
                background={action.type === "warning" ? "warning" : action.type === "success" ? "success" : "subdued"}
              >
                <s-text>{action.text}</s-text>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

      {/* Visual Funnel */}
      <s-section heading="Conversion Funnel">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <FunnelBar label="Eligible" value={totalEligible} max={totalEligible} color="#2196F3" />
            <FunnelBar label="Shown" value={shown} max={totalEligible} color="#4CAF50" />
            <FunnelBar label="Clicked" value={clicked} max={totalEligible} color="#FF9800" />
            <FunnelBar label="Converted" value={totalConverted} max={totalEligible} color="#9C27B0" />
          </s-stack>
        </s-box>
        {biggestDrop.drop > 30 && shown > 10 && (
          <s-box padding="tight" background="warning" borderRadius="base">
            <s-text>⚠ Biggest drop: <strong>{biggestDrop.stage}</strong> (-{biggestDrop.drop.toFixed(0)}%)</s-text>
          </s-box>
        )}
      </s-section>

      {/* Trigger Performance - simplified */}
      <s-section heading="Trigger Performance">
        {triggerEntries.length > 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd" }}>
                  <th style={{ textAlign: "left", padding: "8px" }}>Trigger</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>Shown</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>Converted</th>
                  <th style={{ textAlign: "center", padding: "8px" }}>CVR</th>
                  <th style={{ textAlign: "right", padding: "8px" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sortedTriggers.map(([type, data], idx) => (
                  <tr key={type} style={{ borderBottom: "1px solid #eee", background: idx === 0 ? "#e8f5e9" : "transparent" }}>
                    <td style={{ padding: "8px" }}>
                      {idx === 0 && "🏆 "}{formatTrigger(type)}
                    </td>
                    <td style={{ textAlign: "center", padding: "8px" }}>{data.shown}</td>
                    <td style={{ textAlign: "center", padding: "8px" }}>{data.converted}</td>
                    <td style={{ textAlign: "center", padding: "8px", fontWeight: "bold", color: data.conversionRate > 5 ? "#2e7d32" : data.conversionRate < 2 ? "#f57c00" : "inherit" }}>
                      {data.conversionRate.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: "right", padding: "8px", color: data.revenue > 0 ? "#2e7d32" : "inherit" }}>${data.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>
        ) : (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text>No trigger data yet.</s-text>
              <s-text variant="bodySmall" tone="subdued">Visit your store and trigger banners to collect data.</s-text>
            </s-stack>
          </s-box>
        )}
      </s-section>

      {/* A/B Test Results - Visual */}
      <s-section heading="Discount A/B Test">
        <s-box padding="tight" background={confidence.color} borderRadius="base" style={{ marginBottom: 8 }}>
          <s-text variant="bodySmall">Confidence: <strong>{confidence.level}</strong> ({controlGroupStats.treatment.shown + controlGroupStats.control.shown} samples)</s-text>
        </s-box>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="loose">
              <s-text style={{ width: "100px" }}>Treatment</s-text>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ background: "#4CAF50", height: 24, borderRadius: 4, width: `${Math.min(treatmentRate * 10, 100)}%`, minWidth: treatmentRate > 0 ? 20 : 0 }} />
                <s-text><strong>{controlGroupStats.treatment.conversionRate}%</strong></s-text>
              </div>
              <s-text style={{ width: "100px", textAlign: "right" }}>${controlGroupStats.treatment.revenue.toFixed(0)}</s-text>
            </s-stack>
            <s-stack direction="inline" gap="loose">
              <s-text style={{ width: "100px" }}>Control</s-text>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ background: "#9E9E9E", height: 24, borderRadius: 4, width: `${Math.min(controlRate * 10, 100)}%`, minWidth: controlRate > 0 ? 20 : 0 }} />
                <s-text><strong>{controlGroupStats.control.conversionRate}%</strong></s-text>
              </div>
              <s-text style={{ width: "100px", textAlign: "right" }}>${controlGroupStats.control.revenue.toFixed(0)}</s-text>
            </s-stack>
          </s-stack>
          <s-box padding="tight" background={discountLift > 10 ? "success" : discountLift < 0 ? "critical" : "subdued"} borderRadius="base" style={{ marginTop: 12 }}>
            <s-text>
              {discountLift > 10
                ? `✓ Discounts work! +${discountLift.toFixed(0)}% lift in conversions.`
                : discountLift < 0
                ? `⚠ Discounts may hurt conversions (${discountLift.toFixed(0)}% lift). Consider reducing.`
                : `Minimal difference (${discountLift.toFixed(0)}% lift). Need more data or test different discounts.`}
            </s-text>
          </s-box>
        </s-box>
      </s-section>

      <s-section heading="Recent Events">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <pre style={{ margin: 0, fontSize: "11px", maxHeight: "300px", overflow: "auto" }}>
            {JSON.stringify(recentEvents, null, 2)}
          </pre>
        </s-box>
      </s-section>
    </s-page>
  );
}
