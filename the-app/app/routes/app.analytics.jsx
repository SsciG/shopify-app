import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useLoaderData } from "react-router";
// NOTE: optimizer.server imports are done dynamically inside loader to avoid client bundling

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

  // OPTIMIZER OBSERVABILITY: Get learning stats
  // Dynamic import to avoid client bundling (server-only module)
  const { getLearningStats, getOptimalConfig } = await import("../optimizer.server");
  const learningStats = await getLearningStats(shop);
  const optimalConfig = await getOptimalConfig(shop, {
    delay: 4000,
    discount: 10,
    minDelay: 2000,
    maxDelay: 20000,
    minDiscount: 5,
    maxDiscount: 30
  });

  // Get optimizer decision distribution
  const optimizerDecisions = await prisma.event.groupBy({
    by: ["delay", "discount"],
    where: {
      shop,
      event: "optimizer_decision",
      delay: { not: null },
      discount: { not: null }
    },
    _count: { _all: true }
  });

  // Get conversion rates per combo (the key insight)
  const comboPerformance = [];
  for (const combo of learningStats.topPerformers || []) {
    comboPerformance.push({
      delay: combo.delay,
      discount: combo.discount,
      shown: combo.shown,
      converted: combo.converted,
      rate: combo.rate
    });
  }

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
    })),
    // OPTIMIZER OBSERVABILITY
    optimizer: {
      isLearning: optimalConfig.isLearning,
      confidence: optimalConfig.confidence,
      dataPoints: optimalConfig.dataPoints,
      bestDelay: optimalConfig.delay,
      bestDiscount: optimalConfig.discount,
      bestRate: optimalConfig.conversionRate,
      testedCombos: learningStats.totalCombos,
      topPerformers: comboPerformance,
      decisions: optimizerDecisions.map(d => ({
        delay: d.delay,
        discount: d.discount,
        count: getCount(d)
      }))
    }
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
    recentEvents,
    optimizer
  } = useLoaderData();

  // Key state: do we have ANY data?
  const hasData = shown > 0;
  const hasEnoughData = shown >= 50;

  // Calculate rates and drop-offs (only when we have data)
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
  const sortedTriggers = [...triggerEntries].sort((a, b) => parseFloat(b[1].conversionRate) - parseFloat(a[1].conversionRate));
  const bestTrigger = sortedTriggers[0];
  const worstTrigger = sortedTriggers.length > 1 ? sortedTriggers[sortedTriggers.length - 1] : null;

  // Calculate discount lift (only meaningful with data)
  const treatmentRate = parseFloat(controlGroupStats.treatment.conversionRate) || 0;
  const controlRate = parseFloat(controlGroupStats.control.conversionRate) || 0;
  const discountLift = controlRate > 0 ? ((treatmentRate - controlRate) / controlRate * 100) : 0;
  const hasABData = controlGroupStats.treatment.shown + controlGroupStats.control.shown >= 30;

  const formatTrigger = (trigger) => {
    const labels = {
      post_cart_idle: "Post-Cart Hesitation",
      hesitation: "Variant Comparison",
      deep_scroll: "Deep Scroll",
      idle: "Time on Page"
    };
    return labels[trigger] || trigger;
  };

  // Generate action - ONE clear next step
  const getPriorityAction = () => {
    if (!hasData) {
      return {
        type: "info",
        title: "Start collecting data",
        steps: [
          "Visit a product page on your store",
          "Wait for the banner to appear",
          "Click or close the banner"
        ]
      };
    }

    if (!hasEnoughData) {
      return {
        type: "info",
        title: `Collecting data (${shown}/50)`,
        desc: "Continue testing to unlock insights"
      };
    }

    // We have enough data - give real recommendations
    if (bestTrigger && parseFloat(bestTrigger[1].conversionRate) > 3) {
      return {
        type: "success",
        title: `${formatTrigger(bestTrigger[0])} is working well`,
        desc: `${bestTrigger[1].conversionRate}% conversion rate`
      };
    }

    if (discountLift > 20 && hasABData) {
      return {
        type: "success",
        title: "Discounts are effective",
        desc: `+${discountLift.toFixed(0)}% lift in conversions`
      };
    }

    if (biggestDrop.drop > 50 && biggestDrop.to === "clicked") {
      return {
        type: "warning",
        title: "Banner engagement is low",
        desc: "Consider improving banner copy or design"
      };
    }

    return {
      type: "success",
      title: "System running normally",
      desc: `${totalConverted} conversions from ${shown} impressions`
    };
  };

  const priorityAction = getPriorityAction();

  // Visual bar component (only used when we have data)
  const FunnelBar = ({ label, value, max, color = "#4CAF50" }) => {
    const pct = max > 0 ? (value / max * 100) : 0;
    return (
      <s-stack direction="inline" gap="tight">
        <s-text style={{ width: "100px" }}>{label}</s-text>
        <div style={{ flex: 1, background: "#eee", borderRadius: 4, height: 20, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, background: color, height: "100%" }} />
        </div>
        <s-text style={{ width: "60px", textAlign: "right" }}>{value}</s-text>
      </s-stack>
    );
  };

  return (
    <s-page heading="Nudge Analytics">
      {/* 1. Priority Action - THE decision */}
      <s-section heading="Priority Action">
        <s-box
          padding="base"
          borderRadius="base"
          background={priorityAction.type === "warning" ? "warning" : priorityAction.type === "success" ? "success" : "subdued"}
        >
          <s-text variant="headingSm">{priorityAction.title}</s-text>
          {priorityAction.desc && (
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>{priorityAction.desc}</s-text>
          )}
          {priorityAction.steps && (
            <s-stack direction="block" gap="none" style={{ marginTop: 8 }}>
              {priorityAction.steps.map((step, i) => (
                <s-text key={i} variant="bodySmall">→ {step}</s-text>
              ))}
            </s-stack>
          )}
        </s-box>
      </s-section>

      {/* 2. Overview - "Is it working?" */}
      <s-section heading="Overview">
        {hasData ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              {totalConverted > 0 && (
                <s-text>
                  Revenue: <strong style={{ color: "#2e7d32" }}>${totalRevenue.toFixed(2)}</strong> from {totalConverted} conversions
                </s-text>
              )}
              {bestTrigger && parseFloat(bestTrigger[1].conversionRate) > 0 && (
                <s-text>
                  Best trigger: <strong>{formatTrigger(bestTrigger[0])}</strong> ({bestTrigger[1].conversionRate}% CVR)
                </s-text>
              )}
              {hasABData && discountLift !== 0 && (
                <s-text>
                  Discount impact: <strong style={{ color: discountLift > 0 ? "#2e7d32" : "#c62828" }}>
                    {discountLift > 0 ? "+" : ""}{discountLift.toFixed(0)}%
                  </strong> conversion lift
                </s-text>
              )}
              {!totalConverted && !hasEnoughData && (
                <s-text tone="subdued">No conversions yet — keep collecting data</s-text>
              )}
            </s-stack>
          </s-box>
        ) : (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text variant="headingSm">No activity yet</s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Once users interact with your store, you'll see revenue, conversion rates, and trigger performance.
            </s-text>
          </s-box>
        )}
      </s-section>

      {/* 3. Funnel - "Where do users drop off?" */}
      <s-section heading="Conversion Funnel">
        {hasData ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <FunnelBar label="Eligible" value={totalEligible} max={totalEligible} color="#2196F3" />
              <FunnelBar label="Shown" value={shown} max={totalEligible} color="#4CAF50" />
              <FunnelBar label="Clicked" value={clicked} max={totalEligible} color="#FF9800" />
              <FunnelBar label="Converted" value={totalConverted} max={totalEligible} color="#9C27B0" />
            </s-stack>
            {biggestDrop.drop > 30 && shown > 10 && (
              <s-box padding="tight" background="warning" borderRadius="base" style={{ marginTop: 12 }}>
                <s-text variant="bodySmall">
                  Biggest drop: <strong>{biggestDrop.stage}</strong> (-{biggestDrop.drop.toFixed(0)}%)
                </s-text>
              </s-box>
            )}
          </s-box>
        ) : (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text variant="headingSm">No data yet</s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              The funnel shows where users drop off at each stage.
            </s-text>
          </s-box>
        )}
      </s-section>

      {/* 4. Triggers - "Which behavior works best?" */}
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
                      {idx === 0 && sortedTriggers.length > 1 && "🏆 "}{formatTrigger(type)}
                    </td>
                    <td style={{ textAlign: "center", padding: "8px" }}>{data.shown}</td>
                    <td style={{ textAlign: "center", padding: "8px" }}>{data.converted}</td>
                    <td style={{ textAlign: "center", padding: "8px", fontWeight: "bold", color: parseFloat(data.conversionRate) > 5 ? "#2e7d32" : parseFloat(data.conversionRate) < 2 ? "#f57c00" : "inherit" }}>
                      {data.conversionRate}%
                    </td>
                    <td style={{ textAlign: "right", padding: "8px", color: data.revenue > 0 ? "#2e7d32" : "inherit" }}>${data.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>
        ) : (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text variant="headingSm">No data yet</s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Triggers will appear after users interact with your store.
            </s-text>
          </s-box>
        )}
      </s-section>

      {/* 5. A/B Test - "Does discount help?" */}
      <s-section heading="Discount Impact">
        {hasABData ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="loose">
                <s-text style={{ width: "100px" }}>With discount</s-text>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ background: "#4CAF50", height: 24, borderRadius: 4, width: `${Math.min(treatmentRate * 10, 100)}%`, minWidth: treatmentRate > 0 ? 20 : 0 }} />
                  <s-text><strong>{controlGroupStats.treatment.conversionRate}%</strong></s-text>
                </div>
                <s-text style={{ width: "80px", textAlign: "right" }}>${controlGroupStats.treatment.revenue.toFixed(0)}</s-text>
              </s-stack>
              <s-stack direction="inline" gap="loose">
                <s-text style={{ width: "100px" }}>Without</s-text>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ background: "#9E9E9E", height: 24, borderRadius: 4, width: `${Math.min(controlRate * 10, 100)}%`, minWidth: controlRate > 0 ? 20 : 0 }} />
                  <s-text><strong>{controlGroupStats.control.conversionRate}%</strong></s-text>
                </div>
                <s-text style={{ width: "80px", textAlign: "right" }}>${controlGroupStats.control.revenue.toFixed(0)}</s-text>
              </s-stack>
            </s-stack>
            <s-box padding="tight" background={discountLift > 10 ? "success" : discountLift < 0 ? "critical" : "subdued"} borderRadius="base" style={{ marginTop: 12 }}>
              <s-text variant="bodySmall">
                {discountLift > 10
                  ? `Discounts increase conversions by +${discountLift.toFixed(0)}%`
                  : discountLift < 0
                  ? `Discounts may hurt conversions (${discountLift.toFixed(0)}%)`
                  : `Minimal difference — need more data`}
              </s-text>
            </s-box>
          </s-box>
        ) : (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text variant="headingSm">Not enough data yet</s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              We compare users who see discounts vs those who don't. This shows if discounts actually increase sales.
            </s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 8 }}>
              {controlGroupStats.treatment.shown + controlGroupStats.control.shown}/30 samples collected
            </s-text>
          </s-box>
        )}
      </s-section>

      {/* 6. Optimizer Observability - THE LEARNING SYSTEM */}
      <s-section heading="Optimizer Performance">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            {/* Status */}
            <s-stack direction="inline" gap="tight">
              <s-text variant="headingSm">
                {optimizer.isLearning ? "📊 Learning" : "🎯 Optimized"}
              </s-text>
              <s-text variant="bodySmall" tone="subdued">
                ({optimizer.confidence} confidence, {optimizer.dataPoints} data points)
              </s-text>
            </s-stack>

            {/* Current best */}
            {!optimizer.isLearning && (
              <s-box padding="tight" background="success" borderRadius="base">
                <s-text variant="bodySmall">
                  Best combo: <strong>{(optimizer.bestDelay / 1000).toFixed(1)}s delay / {optimizer.bestDiscount}% discount</strong> → {optimizer.bestRate}% CVR
                </s-text>
              </s-box>
            )}

            {/* Combo performance table */}
            {optimizer.topPerformers?.length > 0 && (
              <s-stack direction="block" gap="tight">
                <s-text variant="bodySm" tone="subdued">Tested combinations (by conversion rate):</s-text>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ddd", background: "#f5f5f5" }}>
                      <th style={{ padding: "6px", textAlign: "left" }}>Delay</th>
                      <th style={{ padding: "6px", textAlign: "left" }}>Discount</th>
                      <th style={{ padding: "6px", textAlign: "center" }}>Shown</th>
                      <th style={{ padding: "6px", textAlign: "center" }}>Converted</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optimizer.topPerformers.map((combo, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #eee", background: i === 0 ? "#e8f5e9" : "transparent" }}>
                        <td style={{ padding: "6px" }}>{(combo.delay / 1000).toFixed(1)}s</td>
                        <td style={{ padding: "6px" }}>{combo.discount}%</td>
                        <td style={{ padding: "6px", textAlign: "center" }}>{combo.shown}</td>
                        <td style={{ padding: "6px", textAlign: "center" }}>{combo.converted}</td>
                        <td style={{ padding: "6px", textAlign: "right", fontWeight: i === 0 ? "bold" : "normal", color: i === 0 ? "#2e7d32" : "inherit" }}>
                          {combo.rate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </s-stack>
            )}

            {/* Decision distribution */}
            {optimizer.decisions?.length > 0 && (
              <s-stack direction="block" gap="tight">
                <s-text variant="bodySm" tone="subdued">Decision distribution (what optimizer chose):</s-text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {optimizer.decisions.map((d, i) => (
                    <span key={i} style={{
                      padding: "2px 8px",
                      background: "#f0f0f0",
                      borderRadius: 4,
                      fontSize: 11
                    }}>
                      {(d.delay / 1000).toFixed(0)}s/{d.discount}% × {d.count}
                    </span>
                  ))}
                </div>
              </s-stack>
            )}

            {/* Empty state */}
            {optimizer.topPerformers?.length === 0 && (
              <s-text variant="bodySmall" tone="subdued">
                No combo performance data yet. The optimizer needs banner impressions with conversions to learn.
              </s-text>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* 7. Recent Activity */}
      <s-section heading="Recent Activity">
        {recentEvents.length > 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ margin: 0, fontSize: "11px", maxHeight: "200px", overflow: "auto" }}>
              {JSON.stringify(recentEvents, null, 2)}
            </pre>
          </s-box>
        ) : (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text variant="headingSm">No events yet</s-text>
            <s-text variant="bodySmall" tone="subdued" style={{ marginTop: 4 }}>
              Events will appear when users interact with your store.
            </s-text>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}
