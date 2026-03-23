/*
  Warnings:

  - Added the required column `expiresAt` to the `DiscountCode` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiscountCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "triggerType" TEXT,
    "productId" TEXT,
    "discount" INTEGER NOT NULL,
    "controlGroup" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME NOT NULL,
    "usageLimit" INTEGER NOT NULL DEFAULT 1,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" DATETIME,
    "orderId" TEXT,
    "orderTotal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DiscountCode" ("code", "createdAt", "discount", "id", "orderId", "orderTotal", "productId", "sessionId", "shop", "triggerType", "used", "usedAt") SELECT "code", "createdAt", "discount", "id", "orderId", "orderTotal", "productId", "sessionId", "shop", "triggerType", "used", "usedAt" FROM "DiscountCode";
DROP TABLE "DiscountCode";
ALTER TABLE "new_DiscountCode" RENAME TO "DiscountCode";
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");
CREATE INDEX "DiscountCode_sessionId_idx" ON "DiscountCode"("sessionId");
CREATE INDEX "DiscountCode_code_idx" ON "DiscountCode"("code");
CREATE INDEX "DiscountCode_shop_idx" ON "DiscountCode"("shop");
CREATE INDEX "DiscountCode_triggerType_idx" ON "DiscountCode"("triggerType");
CREATE INDEX "DiscountCode_controlGroup_idx" ON "DiscountCode"("controlGroup");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
