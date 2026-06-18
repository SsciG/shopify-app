// Plan configuration - single source of truth
// Uses Shopify Billing API only (no external store)

export const PLANS = {
  starter: {
    maxStores: 1,
    price: 4.99,
  },
  pro: {
    maxStores: 5,
    price: 39.99,
  },
  enterprise: {
    maxStores: 10,
    price: 49.99,
  },
};

export function getPlanByName(name) {
  const plan = PLANS[name?.toLowerCase()];
  if (plan) {
    return { name: name.toLowerCase(), ...plan };
  }
  return null;
}
