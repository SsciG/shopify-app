-- AlterTable
ALTER TABLE "Event" ADD COLUMN "orderTotal" REAL;

-- CreateIndex
CREATE INDEX "Event_shop_sessionId_event_decisionSource_idx" ON "Event"("shop", "sessionId", "event", "decisionSource");
