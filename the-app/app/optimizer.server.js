/**
 * Optimizer - learns optimal delay and discount values per store
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

/**
 * Get learned optimal values for a shop
 * Returns the best performing delay/discount combo based on conversion data
 */
export async function getOptimalConfig(shop, baseConfig) {
  const minDataPoints = 30; // Need at least this many to trust the data

  // Get conversion stats grouped by delay and discount buckets
  const events = await prisma.event.findMany({
    where: {
      shop,
      event: { in: ["banner_shown", "converted"] },
      delay: { not: null },
      discount: { not: null }
    },
    select: {
      event: true,
      delay: true,
      discount: true
    }
  });

  if (events.length < minDataPoints) {
    // Not enough data - return base config with exploration flag
    return {
      delay: baseConfig.delay,
      discount: baseConfig.discount,
      confidence: "low",
      dataPoints: events.length,
      minRequired: minDataPoints,
      isLearning: true,
      recommendation: null
    };
  }

  // Build performance matrix: { delay -> { discount -> { shown, converted, rate } } }
  const matrix = {};

  for (const event of events) {
    // Bucket the values
    const delayBucket = findNearestBucket(event.delay, DELAY_BUCKETS);
    const discountBucket = findNearestBucket(event.discount, DISCOUNT_BUCKETS);
    const key = `${delayBucket}_${discountBucket}`;

    if (!matrix[key]) {
      matrix[key] = { delay: delayBucket, discount: discountBucket, shown: 0, converted: 0 };
    }

    if (event.event === "banner_shown") {
      matrix[key].shown++;
    } else if (event.event === "converted") {
      matrix[key].converted++;
    }
  }

  // Calculate conversion rates and find best performer
  let bestCombo = null;
  let bestRate = 0;
  let totalShown = 0;

  const comboStats = [];

  for (const key of Object.keys(matrix)) {
    const combo = matrix[key];
    totalShown += combo.shown;

    if (combo.shown >= 5) { // Need at least 5 impressions for this combo
      combo.rate = (combo.converted / combo.shown) * 100;
      comboStats.push(combo);

      if (combo.rate > bestRate) {
        bestRate = combo.rate;
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
      recommendation = `${parts.join(" and ")} (${bestCombo.rate.toFixed(1)}% CVR vs current)`;
    }
  }

  return {
    delay: bestCombo?.delay ?? baseConfig.delay,
    discount: bestCombo?.discount ?? baseConfig.discount,
    confidence,
    dataPoints: events.length,
    totalShown,
    conversionRate: bestRate.toFixed(1),
    isLearning: false,
    recommendation,
    // All combos for transparency
    testedCombos: comboStats.sort((a, b) => b.rate - a.rate).slice(0, 5)
  };
}

/**
 * Get next values to try using Thompson Sampling
 * Balances exploitation (use best) vs exploration (try new)
 */
export async function getNextValues(shop, baseConfig, explorationRate = 20) {
  const shouldExplore = Math.random() * 100 < explorationRate;

  if (shouldExplore) {
    // Exploration: try values we haven't tested much
    const undertestedCombo = await findUndertestedCombo(shop, baseConfig);
    if (undertestedCombo) {
      return {
        delay: undertestedCombo.delay,
        discount: undertestedCombo.discount,
        source: "exploration"
      };
    }
  }

  // Exploitation: use learned optimal values
  const optimal = await getOptimalConfig(shop, baseConfig);
  return {
    delay: optimal.delay,
    discount: optimal.discount,
    source: optimal.isLearning ? "default" : "learned"
  };
}

/**
 * Find a delay/discount combo that hasn't been tested enough
 */
async function findUndertestedCombo(shop, baseConfig) {
  const minTests = 10; // Combos with fewer tests than this are undertested

  // Get test counts for each combo
  const testCounts = await prisma.event.groupBy({
    by: ["delay", "discount"],
    where: {
      shop,
      event: "banner_shown",
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

  // Check adjacent buckets first (more likely to find improvements nearby)
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
          // Weight by proximity to current (prefer nearby experiments)
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
 */
export async function getLearningStats(shop) {
  const stats = await prisma.event.groupBy({
    by: ["delay", "discount"],
    where: {
      shop,
      event: "banner_shown",
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
      delay: { not: null },
      discount: { not: null }
    },
    _count: { _all: true }
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
      rate: 0
    };
  }

  for (const c of conversions) {
    const key = `${c.delay}_${c.discount}`;
    if (combos[key]) {
      combos[key].converted = c._count._all;
      combos[key].rate = (c._count._all / combos[key].shown) * 100;
    }
  }

  // Sort by conversion rate
  const sorted = Object.values(combos)
    .filter(c => c.shown >= 5)
    .sort((a, b) => b.rate - a.rate);

  return {
    totalCombos: Object.keys(combos).length,
    testedCombos: sorted.length,
    topPerformers: sorted.slice(0, 5),
    worstPerformers: sorted.slice(-3).reverse()
  };
}
