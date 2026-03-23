/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserMetrics` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `Event` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `metadata` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Event` table. All the data in the column will be lost.
  - Added the required column `sessionId` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "User";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserMetrics";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SessionMetrics" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "bannerShown" INTEGER NOT NULL DEFAULT 0,
    "bannerClicked" INTEGER NOT NULL DEFAULT 0,
    "bannerClosed" INTEGER NOT NULL DEFAULT 0,
    "lastDelay" INTEGER,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "productId" TEXT,
    "triggerType" TEXT,
    "delay" INTEGER,
    "idleTime" REAL,
    "scrollDepth" REAL,
    "variantChanges" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("event", "id", "ts") SELECT "event", "id", "ts" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_sessionId_idx" ON "Event"("sessionId");
CREATE INDEX "Event_event_idx" ON "Event"("event");
CREATE INDEX "Event_triggerType_idx" ON "Event"("triggerType");
CREATE INDEX "Event_delay_idx" ON "Event"("delay");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
