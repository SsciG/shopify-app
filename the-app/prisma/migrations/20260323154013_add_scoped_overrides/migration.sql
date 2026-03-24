-- CreateTable
CREATE TABLE "Override" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'limit',
    "discount" INTEGER,
    "delay" INTEGER,
    "optimizationMode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Override_shop_idx" ON "Override"("shop");

-- CreateIndex
CREATE INDEX "Override_shop_scopeType_idx" ON "Override"("shop", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "Override_shop_scopeType_scopeValue_key" ON "Override"("shop", "scopeType", "scopeValue");
