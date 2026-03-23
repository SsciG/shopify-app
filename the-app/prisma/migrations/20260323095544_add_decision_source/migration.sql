-- AlterTable
ALTER TABLE "Event" ADD COLUMN "decisionSource" TEXT;

-- CreateIndex
CREATE INDEX "Event_decisionSource_idx" ON "Event"("decisionSource");
