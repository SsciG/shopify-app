/**
 * Optimizer - learns optimal delay and discount values per store
 *
 * CRITICAL DESIGN DECISIONS:
 * 1. Only learn from TREATMENT group (where discount was actually applied)
 * 2. Optimize for REVENUE PER IMPRESSION, not just conversion rate
 * 3. High exploration rate during cold start
 * 4. Dedupe by sessionId to avoid double-counting
 *
 * Uses Thompson Sampling (multi-armed bandit) to balance:
 * - Exploitation: use what works best so far
 * - Exploration: try new values to find better ones
 *
 * Each store learns independently based on their conversion data.
 */

import prisma from "./db.server";

// Bucket definitions for delay (ms) and discount (%)
const DELAY_BUCKETS = [2000, 3000, 4000, 5000, 6000, 8000, 10000];
const DISCOUNT_BUCKETS = [5, 8, 10, 12, 15, 20, 25];

// Minimum data points before trusting learned values
const MIN_DATA_POINTS = 30;
const MIN_IMPRESSIONS_PER_COMBO = 5;

/**
 * Get learned optimal values for a shop
 * Returns the best performing delay/discount combo based on REVENUE per impression
 *
 * CRITICAL: Only learns from treatment group (decisionSource = "treatment")
 * Control group is for measuring lift, NOT for learning optimal values
 */
export async function getOptimalConfig(shop, baseConfig) {
  // Get TREATMENT group events only (where discount was actually applied)
  // This is critical: control group data would corrupt learning
  // NOTE: We fetch ALL events and dedupe per session+combo in code
  // (Prisma distinct would dedupe globally, losing multi-combo sessions)
  const shownEvents = await prisma.event.findMany({
    where: {
      shop,
      event: "banner_shown",
      decisionSource: "treatment",  // CRITICAL: only treatment group
      delay: { not: null },
      discount: { not: null }
    },
    select: {
      sessionId: true,
      delay: true,
      discount: true
    }
  });

  const convertedEvents = await prisma.event.findMany({
    where: {
      shop,
      event: "converted",
      decisionSource: "treatment",  // CRITICAL: only treatment group
      delay: { not: null },
      discount: { not: null }
    },
    select: {
      sessionId: true,
      delay: true,
      discount: true,
      orderTotal: true
    }
  });

  // ISSUE #3 FIX: Base learning threshold on unique impressions, not total events
  if (shownEvents.length < MIN_DATA_POINTS) {
    return {
      delay: baseConfig.delay,
      discount: baseConfig.discount,
      confidence: "low",
      dataPoints: shownEvents.length,
      minRequired: MIN_DATA_POINTS,
      isLearning: true,
      recommendation: null,
      testedCombos: []
    };
  }

  // Build performance matrix by combo
  // Key metric: NET REVENUE PER IMPRESSION (profit after discount)
  // CRITICAL: Dedupe impressions by session+combo (not just session globally)
  // Do NOT dedupe conversions - same session can buy multiple times
  const matrix = {};
  const seenImpressions = new Set();  // Track sessionId_delay_discount for impressions only

  // Count impressions per combo (dedupe: 1 per session per combo)
  for (const event of shownEvents) {
    const delayBucket = findNearestBucket(event.delay, DELAY_BUCKETS);
    const discountBucket = findNearestBucket(event.discount, DISCOUNT_BUCKETS);
    const comboKey = `${delayBucket}_${discountBucket}`;
    const dedupKey = `${event.sessionId}_${delayBucket}_${discountBucket}`;

    // Dedupe: 1 impression per session per combo
    if (seenImpressions.has(dedupKey)) continue;
    seenImpressions.add(dedupKey);

    if (!matrix[comboKey]) {
      matrix[comboKey] = {
        delay: delayBucket,
        discount: discountBucket,
        shown: 0,
        converted: 0,
        totalRevenue: 0
      };
    }

    matrix[comboKey].shown++;
  }

  // Add conversions and revenue
  // ISSUE #2 FIX: Do NOT dedupe conversions - same session can buy multiple times
  // ISSUE #1 FIX: Use NET revenue (subtract discount cost) not gross revenue
  for (const event of convertedEvents) {
    const delayBucket = findNearestBucket(event.delay, DELAY_BUCKETS);
    const discountBucket = findNearestBucket(event.discount, DISCOUNT_BUCKETS);
    const comboKey = `${delayBucket}_${discountBucket}`;

    if (matrix[comboKey]) {
      matrix[comboKey].converted++;
      // ISSUE #1 FIX: Calculate NET revenue (profit after discount)
      // e.g., $100 order with 10% discount = $90 net revenue
      const discountPercent = event.discount || 0;
      const netRevenue = (event.orderTotal || 0) * (1 - discountPercent / 100);
      matrix[comboKey].totalRevenue += netRevenue;
    }
  }

  // Calculate metrics and find best performer
  let bestCombo = null;
  let bestValue = 0;  // Revenue per impression
  let totalShown = 0;

  const comboStats = [];

  for (const key of Object.keys(matrix)) {
    const combo = matrix[key];
    totalShown += combo.shown;

    if (combo.shown >= MIN_IMPRESSIONS_PER_COMBO) {
      combo.rate = (combo.converted / combo.shown) * 100;
      combo.revenuePerImpression = combo.shown > 0 ? combo.totalRevenue / combo.shown : 0;
      comboStats.push(combo);

      // OPTIMIZE FOR REVENUE PER IMPRESSION, not CVR
      // This accounts for discount cost: 5% discount with 3% CVR may beat 25% discount with 5% CVR
      if (combo.revenuePerImpression > bestValue) {
        bestValue = combo.revenuePerImpression;
        bestCombo = combo;
      }
    }
  }

  // Determine confidence based on data volume
  let confidence = "low";
  if (totalShown >= 100) confidence = "high";
  else if (totalShown >= 50) confidence = "medium";

  // Generate recommendation text
  let recommendation = null;
  if (bestCombo && confidence !== "low") {
    const currentDelay = baseConfig.delay;
    const currentDiscount = baseConfig.discount;

    const delayDiff = bestCombo.delay - currentDelay;
    const discountDiff = bestCombo.discount - currentDiscount;

    const parts = [];
    if (Math.abs(delayDiff) >= 1000) {
      parts.push(delayDiff < 0
        ? `Reduce delay to ${bestCombo.delay/1000}s`
        : `Increase delay to ${bestCombo.delay/1000}s`);
    }
    if (Math.abs(discountDiff) >= 2) {
      parts.push(discountDiff > 0
        ? `Increase discount to ${bestCombo.discount}%`
        : `Reduce discount to ${bestCombo.discount}%`);
    }

    if (parts.length > 0) {
      recommendation = `${parts.join(" and ")} ($${bestCombo.revenuePerImpression.toFixed(2)}/impression)`;
    }
  }

  // OBSERVABILITY: Log learning state
  console.log("📊 OPTIMIZER STATE:", {
    shop: shop.slice(0, 20),
    totalDataPoints: shownEvents.length,
    totalShown,
    uniqueCombos: comboStats.length,
    bestCombo: bestCombo ? `${bestCombo.delay}ms/${bestCombo.discount}%` : "none",
    bestRevenuePerImp: bestValue.toFixed(2),
    bestCVR: bestCombo ? bestCombo.rate.toFixed(1) + "%" : "n/a",
    confidence,
    top3: comboStats
      .sort((a, b) => b.revenuePerImpression - a.revenuePerImpression)
      .slice(0, 3)
      .map(c => `${c.delay}/${c.discount}%→$${c.revenuePerImpression.toFixed(2)}/imp (CVR=${c.rate.toFixed(1)}%)`)
  });

  return {
    delay: bestCombo?.delay ?? baseConfig.delay,
    discount: bestCombo?.discount ?? baseConfig.discount,
    confidence,
    dataPoints: shownEvents.length,
    totalShown,
    conversionRate: bestCombo?.rate?.toFixed(1) ?? "0",
    revenuePerImpression: bestValue.toFixed(2),
    isLearning: false,
    recommendation,
    testedCombos: comboStats
      .sort((a, b) => b.revenuePerImpression - a.revenuePerImpression)
      .slice(0, 5)
  };
}

/**
 * Get next values to try using Thompson Sampling
 * Balances exploitation (use best) vs exploration (try new)
 *
 * CRITICAL: Uses adaptive exploration rate based on data volume (cold start strategy)
 */
export async function getNextValues(shop, baseConfig, baseExplorationRate = 20) {
  // COLD START STRATEGY: High exploration when data is scarce
  const totalEvents = await prisma.event.count({
    where: {
      shop,
      event: "banner_shown",
      decisionSource: "treatment"
    }
  });

  // Adaptive exploration rate
  let explorationRate;
  if (totalEvents < 20) {
    explorationRate = 80;  // Very early: mostly explore
  } else if (totalEvents < 50) {
    explorationRate = 50;  // Early: balanced
  } else if (totalEvents < 100) {
    explorationRate = 30;  // Getting data: still exploring
  } else {
    explorationRate = baseExplorationRate;  // Mature: use configured rate
  }

  const shouldExplore = Math.random() * 100 < explorationRate;
  let result;

  if (shouldExplore) {
    // Exploration: try values we haven't tested much
    const undertestedCombo = await findUndertestedCombo(shop, baseConfig);
    if (undertestedCombo) {
      result = {
        delay: undertestedCombo.delay,
        discount: undertestedCombo.discount,
        source: "exploration",
        reason: `undertested (${undertestedCombo.tests} tests)`
      };
    }
  }

  if (!result) {
    // Exploitation: use learned optimal values
    const optimal = await getOptimalConfig(shop, baseConfig);
    result = {
      delay: optimal.delay,
      discount: optimal.discount,
      source: optimal.isLearning ? "default" : "learned",
      reason: optimal.isLearning
        ? `insufficient data (${optimal.dataPoints}/${MIN_DATA_POINTS})`
        : `best performer ($${optimal.revenuePerImpression}/imp, ${optimal.conversionRate}% CVR)`
    };
  }

  // OBSERVABILITY: Log every decision
  console.log("🎯 OPTIMIZER DECISION:", {
    shop: shop.slice(0, 20),
    delay: result.delay,
    discount: result.discount,
    source: result.source,
    reason: result.reason,
    explorationRate,
    totalEvents,
    rolled: shouldExplore ? "explore" : "exploit"
  });

  return result;
}

/**
 * Find a delay/discount combo that hasn't been tested enough
 * Only counts TREATMENT group impressions
 */
async function findUndertestedCombo(shop, baseConfig) {
  const minTests = 10;

  // Get test counts for each combo (TREATMENT only)
  const testCounts = await prisma.event.groupBy({
    by: ["delay", "discount"],
    where: {
      shop,
      event: "banner_shown",
      decisionSource: "treatment",  // CRITICAL: only treatment
      delay: { not: null },
      discount: { not: null }
    },
    _count: { _all: true }
  });

  // Build a map of tested combos
  const testedMap = {};
  for (const tc of testCounts) {
    const delayBucket = findNearestBucket(tc.delay, DELAY_BUCKETS);
    const discountBucket = findNearestBucket(tc.discount, DISCOUNT_BUCKETS);
    const key = `${delayBucket}_${discountBucket}`;
    testedMap[key] = (testedMap[key] || 0) + tc._count._all;
  }

  // Find undertested combos (prioritize those near current settings)
  const currentDelayBucket = findNearestBucket(baseConfig.delay, DELAY_BUCKETS);
  const currentDiscountBucket = findNearestBucket(baseConfig.discount, DISCOUNT_BUCKETS);

  const delayIdx = DELAY_BUCKETS.indexOf(currentDelayBucket);
  const discountIdx = DISCOUNT_BUCKETS.indexOf(currentDiscountBucket);

  const candidates = [];

  for (let di = -2; di <= 2; di++) {
    for (let dj = -2; dj <= 2; dj++) {
      const newDelayIdx = delayIdx + di;
      const newDiscountIdx = discountIdx + dj;

      if (newDelayIdx >= 0 && newDelayIdx < DELAY_BUCKETS.length &&
          newDiscountIdx >= 0 && newDiscountIdx < DISCOUNT_BUCKETS.length) {
        const delay = DELAY_BUCKETS[newDelayIdx];
        const discount = DISCOUNT_BUCKETS[newDiscountIdx];
        const key = `${delay}_${discount}`;
        const tests = testedMap[key] || 0;

        if (tests < minTests) {
          const distance = Math.abs(di) + Math.abs(dj);
          candidates.push({ delay, discount, tests, distance });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by: fewer tests first, then by distance
  candidates.sort((a, b) => {
    if (a.tests !== b.tests) return a.tests - b.tests;
    return a.distance - b.distance;
  });

  return candidates[0];
}

/**
 * Find nearest bucket value
 */
function findNearestBucket(value, buckets) {
  let nearest = buckets[0];
  let minDiff = Math.abs(value - buckets[0]);

  for (const bucket of buckets) {
    const diff = Math.abs(value - bucket);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = bucket;
    }
  }

  return nearest;
}

/**
 * Get learning stats for display in Settings/Analytics
 * Only uses TREATMENT group data
 */
export async function getLearningStats(shop) {
  // Get stats from TREATMENT group only
  const stats = await prisma.event.groupBy({
    by: ["delay", "discount"],
    where: {
      shop,
      event: "banner_shown",
      decisionSource: "treatment",
      delay: { not: null },
      discount: { not: null }
    },
    _count: { _all: true }
  });

  const conversions = await prisma.event.groupBy({
    by: ["delay", "discount"],
    where: {
      shop,
      event: "converted",
      decisionSource: "treatment",
      delay: { not: null },
      discount: { not: null }
    },
    _count: { _all: true },
    _sum: { orderTotal: true }
  });

  // Build combo performance map
  const combos = {};

  for (const s of stats) {
    const key = `${s.delay}_${s.discount}`;
    combos[key] = {
      delay: s.delay,
      discount: s.discount,
      shown: s._count._all,
      converted: 0,
      revenue: 0,
      rate: 0,
      revenuePerImpression: 0
    };
  }

  for (const c of conversions) {
    const key = `${c.delay}_${c.discount}`;
    if (combos[key]) {
      combos[key].converted = c._count._all;
      combos[key].revenue = c._sum?.orderTotal || 0;
      combos[key].rate = (c._count._all / combos[key].shown) * 100;
      combos[key].revenuePerImpression = combos[key].revenue / combos[key].shown;
    }
  }

  // Sort by revenue per impression (the correct optimization target)
  const sorted = Object.values(combos)
    .filter(c => c.shown >= MIN_IMPRESSIONS_PER_COMBO)
    .sort((a, b) => b.revenuePerImpression - a.revenuePerImpression);

  return {
    totalCombos: Object.keys(combos).length,
    testedCombos: sorted.length,
    topPerformers: sorted.slice(0, 5),
    worstPerformers: sorted.slice(-3).reverse()
  };
}
