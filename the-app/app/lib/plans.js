// Plan configuration - single source of truth
// jewda variant IDs from the Coupon Pulse Subscription product

export const PLANS = {
  starter: {
    maxStores: 1,
    jewdaVariantId: "42439017103442",
    price: 4.99,
  },
  pro: {
    maxStores: 5,
    jewdaVariantId: "42439017136210",
    price: 39.99,
  },
  enterprise: {
    maxStores: 10,
    jewdaVariantId: "42439017168978",
    price: 49.99,
  },
};

export function getPlanByVariantId(variantId) {
  const variantStr = String(variantId);
  for (const [planName, config] of Object.entries(PLANS)) {
    if (config.jewdaVariantId === variantStr) {
      return { name: planName, ...config };
    }
  }
  return null;
}

export function getPlanByName(name) {
  const plan = PLANS[name?.toLowerCase()];
  if (plan) {
    return { name: name.toLowerCase(), ...plan };
  }
  return null;
}
