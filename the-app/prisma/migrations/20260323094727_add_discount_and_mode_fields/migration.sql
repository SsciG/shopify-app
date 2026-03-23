/*
  Warnings:

  - You are about to drop the column `disableOptimize` on the `ProductOverride` table. All the data in the column will be lost.
  - You are about to drop the column `enabled` on the `ProductOverride` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN "discount" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'force',
    "discount" INTEGER,
    "delay" INTEGER,
    "minDelay" INTEGER,
    "maxDelay" INTEGER,
    "minDiscount" INTEGER,
    "maxDiscount" INTEGER,
    "forceShow" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProductOverride" ("createdAt", "delay", "discount", "forceShow", "id", "productId", "shop", "updatedAt") SELECT "createdAt", "delay", "discount", "forceShow", "id", "productId", "shop", "updatedAt" FROM "ProductOverride";
DROP TABLE "ProductOverride";
ALTER TABLE "new_ProductOverride" RENAME TO "ProductOverride";
CREATE INDEX "ProductOverride_shop_idx" ON "ProductOverride"("shop");
CREATE UNIQUE INDEX "ProductOverride_shop_productId_key" ON "ProductOverride"("shop", "productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Event_discount_idx" ON "Event"("discount");
