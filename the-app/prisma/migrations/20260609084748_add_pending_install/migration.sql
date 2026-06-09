-- CreateTable
CREATE TABLE "PendingInstall" (
    "shopDomain" TEXT NOT NULL PRIMARY KEY,
    "licenseKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
