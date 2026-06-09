-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN "extensionNotes" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "subscriptionEndsAt" DATETIME;

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "maxStores" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "jewdaOrderId" TEXT,
    "jewdaSubId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShopLicense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "boundAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unboundAt" DATETIME,
    CONSTRAINT "ShopLicense_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "storeLimit" INTEGER NOT NULL DEFAULT 1,
    "lemonSqueezyCustomerId" TEXT,
    "lemonSqueezySubscriptionId" TEXT,
    "lemonSqueezyVariantId" TEXT,
    "renewsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "installedAt" DATETIME,
    "uninstalledAt" DATETIME,
    "removedByUserAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "License_key_key" ON "License"("key");

-- CreateIndex
CREATE UNIQUE INDEX "License_jewdaOrderId_key" ON "License"("jewdaOrderId");

-- CreateIndex
CREATE INDEX "License_email_idx" ON "License"("email");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLicense_shopDomain_key" ON "ShopLicense"("shopDomain");

-- CreateIndex
CREATE INDEX "ShopLicense_licenseId_idx" ON "ShopLicense"("licenseId");

-- CreateIndex
CREATE INDEX "ShopLicense_active_idx" ON "ShopLicense"("active");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_lemonSqueezySubscriptionId_key" ON "UserSubscription"("lemonSqueezySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStore_shop_key" ON "UserStore"("shop");

-- CreateIndex
CREATE INDEX "UserStore_userId_idx" ON "UserStore"("userId");

-- CreateIndex
CREATE INDEX "UserStore_shop_idx" ON "UserStore"("shop");

-- CreateIndex
CREATE INDEX "UserStore_status_idx" ON "UserStore"("status");
