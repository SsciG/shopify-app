/**
 * Billing utilities for subscription checks
 *
 * Usage in loaders:
 *
 * import { syncBillingStatus, PLAN_NAME } from "../billing.server";
 *
 * export const loader = async ({ request }) => {
 *   const { session, billing } = await authenticate.admin(request);
 *   const { needsRedirect } = await syncBillingStatus(billing, session.shop);
 *   if (needsRedirect) throw redirect("/app/billing");
 *   // ... rest of loader
 * };
 */

import { redirect } from "react-router";
import prisma from "./db.server";

// Plan configuration - single source of truth
export const PLAN_NAMES = {
  STARTER: "Starter",
  PRO: "Pro"
};

// Keep legacy PLAN_NAME for backwards compatibility (points to Pro)
export const PLAN_NAME = PLAN_NAMES.PRO;
export const PLAN_PRICE = 19;

// CRITICAL: Use test mode in development, real billing in production
export const IS_TEST_BILLING = process.env.NODE_ENV !== "production";

// Legacy export for backwards compatibility
export const PLANS = {
  STARTER: PLAN_NAMES.STARTER,
  PRO: PLAN_NAMES.PRO
};

/**
 * CRITICAL: Sync billing status with Shopify and update database.
 * Call this on EVERY admin page load to catch cancellations/payment failures.
 *
 * This ensures:
 * - Cancelled subscriptions → user loses access
 * - Failed payments → user loses access
 * - Reactivated subscriptions → user regains access
 *
 * @param {Object} billing - Shopify billing object from authenticate.admin()
 * @param {string} shop - Shop domain
 * @returns {Promise<{isActive: boolean, needsRedirect: boolean}>}
 */
export async function syncBillingStatus(billing, shop) {
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PLAN_NAMES.STARTER, PLAN_NAMES.PRO],
      isTest: IS_TEST_BILLING
    });

    if (hasActivePayment) {
      // Find which plan they have
      const proSub = appSubscriptions?.find(s => s.name === PLAN_NAMES.PRO);
      const starterSub = appSubscriptions?.find(s => s.name === PLAN_NAMES.STARTER);
      const subscription = proSub || starterSub;
      const billingId = subscription?.id || null;
      const planType = proSub ? "pro" : "starter";

      // Ensure DB is in sync - user has active payment
      await prisma.storeSettings.upsert({
        where: { shop },
        update: { isActive: true, plan: planType, billingId },
        create: { shop, isActive: true, plan: planType, billingId }
      });

      return { isActive: true, needsRedirect: false, plan: planType };
    } else {
      // No active payment - ensure DB reflects this
      // This catches: cancellations, payment failures, expired subscriptions
      const settings = await prisma.storeSettings.findUnique({
        where: { shop },
        select: { isActive: true }
      });

      if (settings?.isActive) {
        // Was active, now isn't - deactivate
        console.log("BILLING SYNC: Deactivating shop (subscription ended)", { shop });
        await prisma.storeSettings.update({
          where: { shop },
          data: { isActive: false, billingId: null }
        });
      }

      return { isActive: false, needsRedirect: true };
    }
  } catch (err) {
    // billing.check can throw if no subscription exists - expected for new installs
    console.log("BILLING SYNC: Check failed (likely no subscription)", { shop, error: err.message });

    // Check local DB as fallback
    const settings = await prisma.storeSettings.findUnique({
      where: { shop },
      select: { isActive: true }
    });

    return {
      isActive: settings?.isActive || false,
      needsRedirect: !settings?.isActive
    };
  }
}

/**
 * Check if user has an active Pro subscription (legacy function)
 * @returns {Promise<{hasProPlan: boolean, subscription: object|null}>}
 */
export async function checkProPlan(billing) {
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PLAN_NAMES.STARTER, PLAN_NAMES.PRO],
      isTest: IS_TEST_BILLING
    });

    // Find which plan they have (Pro takes priority)
    const proSub = appSubscriptions?.find(s => s.name === PLAN_NAMES.PRO);
    const starterSub = appSubscriptions?.find(s => s.name === PLAN_NAMES.STARTER);
    const subscription = proSub || starterSub || null;

    return {
      hasProPlan: !!proSub,
      hasStarterPlan: !!starterSub,
      hasAnyPlan: hasActivePayment,
      subscription
    };
  } catch (err) {
    console.log("BILLING CHECK ERROR:", err.message);
    return {
      hasProPlan: false,
      hasStarterPlan: false,
      hasAnyPlan: false,
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
