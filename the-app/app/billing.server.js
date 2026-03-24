/**
 * Billing utilities for subscription checks
 *
 * Usage in loaders:
 *
 * import { requireProPlan } from "../billing.server";
 *
 * export const loader = async ({ request }) => {
 *   const { session, billing } = await authenticate.admin(request);
 *   await requireProPlan(billing, request); // Redirects to pricing if not Pro
 *   // ... rest of loader
 * };
 */

import { redirect } from "react-router";

// Plan names must match shopify.app.toml
export const PLANS = {
  PRO: "Pro"
};

/**
 * Check if user has an active Pro subscription
 * @returns {Promise<{hasProPlan: boolean, subscription: object|null}>}
 */
export async function checkProPlan(billing) {
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PLANS.PRO],
      isTest: true // Set to false in production
    });

    return {
      hasProPlan: hasActivePayment,
      subscription: appSubscriptions?.[0] || null
    };
  } catch (err) {
    console.log("BILLING CHECK ERROR:", err.message);
    return {
      hasProPlan: false,
      subscription: null
    };
  }
}

/**
 * Require Pro plan - redirects to pricing if not subscribed
 * Use in loaders for protected routes (analytics, overrides)
 */
export async function requireProPlan(billing, request) {
  const { hasProPlan } = await checkProPlan(billing);

  if (!hasProPlan) {
    const url = new URL(request.url);
    const returnTo = url.pathname;
    throw redirect(`/app/pricing?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return true;
}

/**
 * Feature flags based on plan
 * Returns what features are available
 */
export function getFeatureFlags(hasProPlan) {
  return {
    // Free plan features
    basicNudge: true,
    idleTrigger: true,

    // Pro plan features
    analytics: hasProPlan,
    abTesting: hasProPlan,
    overrides: hasProPlan,
    allTriggers: hasProPlan,
    optimization: hasProPlan,
    unlimitedImpressions: hasProPlan
  };
}

/**
 * Check impression limits for free plan
 * @returns {Promise<{allowed: boolean, used: number, limit: number}>}
 */
export async function checkImpressionLimit(prisma, shop, hasProPlan) {
  if (hasProPlan) {
    return { allowed: true, used: 0, limit: Infinity };
  }

  // Free plan: 100 impressions per month
  const FREE_LIMIT = 100;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const impressionsThisMonth = await prisma.event.count({
    where: {
      shop,
      event: "banner_shown",
      createdAt: { gte: startOfMonth }
    }
  });

  return {
    allowed: impressionsThisMonth < FREE_LIMIT,
    used: impressionsThisMonth,
    limit: FREE_LIMIT
  };
}
