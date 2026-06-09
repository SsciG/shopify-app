import crypto from "crypto";
import prisma from "../db.server";
import { getPlanByVariantId, getPlanByName } from "./plans";

// Generate a unique license key (format: XXXX-XXXX-XXXX-XXXX)
export function generateLicenseKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 to avoid confusion
  let key = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) key += "-";
    key += chars[crypto.randomInt(chars.length)];
  }
  return key;
}

// Create a new license after jewda purchase
export async function createLicense({ email, plan, jewdaOrderId, jewdaSubId }) {
  // Check for existing license with same order ID (idempotency)
  if (jewdaOrderId) {
    const existing = await prisma.license.findUnique({
      where: { jewdaOrderId },
    });
    if (existing) {
      return { license: existing, created: false };
    }
  }

  const planConfig = getPlanByName(plan);
  if (!planConfig) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  const key = generateLicenseKey();

  const license = await prisma.license.create({
    data: {
      key,
      email: email.toLowerCase().trim(),
      plan: planConfig.name,
      maxStores: planConfig.maxStores,
      status: "active",
      jewdaOrderId,
      jewdaSubId,
    },
  });

  return { license, created: true };
}

// Bind a shop to a license (on install)
export async function bindShop({ licenseKey, shopDomain }) {
  const license = await prisma.license.findUnique({
    where: { key: licenseKey },
    include: {
      shops: {
        where: { active: true },
      },
    },
  });

  if (!license) {
    return { success: false, error: "INVALID_KEY", message: "License key not found" };
  }

  if (license.status !== "active") {
    return { success: false, error: "LICENSE_INACTIVE", message: `License is ${license.status}` };
  }

  // Check if this shop is already bound to this license
  const existingBinding = await prisma.shopLicense.findUnique({
    where: { shopDomain },
  });

  if (existingBinding) {
    if (existingBinding.licenseId === license.id) {
      // Same license - reactivate if needed
      if (!existingBinding.active) {
        await prisma.shopLicense.update({
          where: { shopDomain },
          data: { active: true, unboundAt: null },
        });
      }
      return { success: true, license, message: "Shop already bound to this license" };
    } else {
      // Different license - shop is bound elsewhere
      return { success: false, error: "SHOP_BOUND_ELSEWHERE", message: "Shop is already bound to a different license" };
    }
  }

  // Check store limit
  const activeShopCount = license.shops.length;
  if (activeShopCount >= license.maxStores) {
    return {
      success: false,
      error: "LIMIT_REACHED",
      message: `Store limit reached. Your ${license.plan} plan allows ${license.maxStores} store(s). You have ${activeShopCount} active.`,
    };
  }

  // Bind the shop
  await prisma.shopLicense.create({
    data: {
      shopDomain,
      licenseId: license.id,
      active: true,
    },
  });

  return { success: true, license, message: "Shop bound successfully" };
}

// Release a shop (on uninstall) - frees a slot
export async function releaseShop({ shopDomain }) {
  const binding = await prisma.shopLicense.findUnique({
    where: { shopDomain },
  });

  if (!binding) {
    return { success: false, message: "Shop not found" };
  }

  await prisma.shopLicense.update({
    where: { shopDomain },
    data: { active: false, unboundAt: new Date() },
  });

  return { success: true, message: "Shop slot released" };
}

// Update license status (for subscription events)
export async function setLicenseStatus({ jewdaSubId, status }) {
  if (!jewdaSubId) {
    return { success: false, message: "No subscription ID provided" };
  }

  const license = await prisma.license.findFirst({
    where: { jewdaSubId },
  });

  if (!license) {
    return { success: false, message: "License not found for subscription" };
  }

  await prisma.license.update({
    where: { id: license.id },
    data: { status },
  });

  return { success: true, message: `License status updated to ${status}` };
}

// Check if a shop is entitled (has active license)
export async function isShopEntitled({ shopDomain }) {
  const binding = await prisma.shopLicense.findUnique({
    where: { shopDomain },
    include: { license: true },
  });

  if (!binding || !binding.active) {
    return { entitled: false, reason: "Shop not bound to any license" };
  }

  if (binding.license.status !== "active") {
    return { entitled: false, reason: `License is ${binding.license.status}` };
  }

  return {
    entitled: true,
    license: binding.license,
    plan: binding.license.plan,
  };
}

// Get license by key (for validation)
export async function getLicenseByKey(key) {
  return prisma.license.findUnique({
    where: { key },
    include: {
      shops: true,
    },
  });
}

// Get licenses by email (for admin lookup / resend)
export async function getLicensesByEmail(email) {
  return prisma.license.findMany({
    where: { email: email.toLowerCase().trim() },
    include: {
      shops: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
