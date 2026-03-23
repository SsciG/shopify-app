/*
  Warnings:

  - Added the required column `shop` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SessionMetrics" ADD COLUMN "shop" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "productId" TEXT,
    "triggerType" TEXT,
    "delay" INTEGER,
    "discount" INTEGER,
    "decisionSource" TEXT,
    "idleTime" REAL,
    "scrollDepth" REAL,
    "variantChanges" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("createdAt", "decisionSource", "delay", "discount", "event", "id", "idleTime", "productId", "scrollDepth", "sessionId", "triggerType", "ts", "variantChanges") SELECT "createdAt", "decisionSource", "delay", "discount", "event", "id", "idleTime", "productId", "scrollDepth", "sessionId", "triggerType", "ts", "variantChanges" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_shop_idx" ON "Event"("shop");
CREATE INDEX "Event_shop_sessionId_idx" ON "Event"("shop", "sessionId");
CREATE INDEX "Event_shop_event_idx" ON "Event"("shop", "event");
CREATE INDEX "Event_shop_triggerType_idx" ON "Event"("shop", "triggerType");
CREATE TABLE "new_ProductOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'limit',
    "discount" INTEGER,
    "delay" INTEGER,
    "minDelay" INTEGER,
    "maxDelay" INTEGER,
    "minDiscount" INTEGER,
    "maxDiscount" INTEGER,
    "optimizationMode" TEXT,
    "forceShow" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProductOverride" ("createdAt", "delay", "discount", "forceShow", "id", "maxDelay", "maxDiscount", "minDelay", "minDiscount", "mode", "optimizationMode", "productId", "shop", "updatedAt") SELECT "createdAt", "delay", "discount", "forceShow", "id", "maxDelay", "maxDiscount", "minDelay", "minDiscount", "mode", "optimizationMode", "productId", "shop", "updatedAt" FROM "ProductOverride";
DROP TABLE "ProductOverride";
ALTER TABLE "new_ProductOverride" RENAME TO "ProductOverride";
CREATE INDEX "ProductOverride_shop_idx" ON "ProductOverride"("shop");
CREATE UNIQUE INDEX "ProductOverride_shop_productId_key" ON "ProductOverride"("shop", "productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SessionMetrics_shop_idx" ON "SessionMetrics"("shop");
