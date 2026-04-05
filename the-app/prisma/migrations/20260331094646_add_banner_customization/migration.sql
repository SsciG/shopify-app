-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreSettings" (
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
    "bannerPosition" TEXT NOT NULL DEFAULT 'bottom-right',
    "bannerSize" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StoreSettings" ("createdAt", "delay", "discount", "enabled", "explorationRate", "maxDelay", "maxDiscount", "minDelay", "minDiscount", "optimizationMode", "shop", "updatedAt") SELECT "createdAt", "delay", "discount", "enabled", "explorationRate", "maxDelay", "maxDiscount", "minDelay", "minDiscount", "optimizationMode", "shop", "updatedAt" FROM "StoreSettings";
DROP TABLE "StoreSettings";
ALTER TABLE "new_StoreSettings" RENAME TO "StoreSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
