-- CreateTable
CREATE TABLE "StoreSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "discount" INTEGER NOT NULL DEFAULT 10,
    "delay" INTEGER NOT NULL DEFAULT 4000,
    "minDelay" INTEGER NOT NULL DEFAULT 2000,
    "maxDelay" INTEGER NOT NULL DEFAULT 20000,
    "minDiscount" INTEGER NOT NULL DEFAULT 5,
    "maxDiscount" INTEGER NOT NULL DEFAULT 30,
    "explorationRate" INTEGER NOT NULL DEFAULT 20,
    "optimizationMode" TEXT NOT NULL DEFAULT 'balanced',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discount" INTEGER,
    "delay" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "forceShow" BOOLEAN NOT NULL DEFAULT false,
    "disableOptimize" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ProductOverride_shop_idx" ON "ProductOverride"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOverride_shop_productId_key" ON "ProductOverride"("shop", "productId");
