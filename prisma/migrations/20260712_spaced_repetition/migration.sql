-- AlterTable
ALTER TABLE "Learning" ADD COLUMN "nextReview" DATETIME;
ALTER TABLE "Learning" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Learning" ADD COLUMN "easeFactor" REAL NOT NULL DEFAULT 2.5;
ALTER TABLE "Learning" ADD COLUMN "interval" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Learning" ADD COLUMN "lastReviewed" DATETIME;

-- CreateIndex
CREATE INDEX "Learning_nextReview_idx" ON "Learning"("nextReview");
