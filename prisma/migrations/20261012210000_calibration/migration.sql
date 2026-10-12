-- AlterTable
ALTER TABLE "SpeakingSubmission" ADD COLUMN     "audioPurgedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExamItemStat" (
    "itemSetId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "n" INTEGER NOT NULL,
    "pCorrect" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "discrimination" DOUBLE PRECISION,
    "flag" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamItemStat_pkey" PRIMARY KEY ("itemSetId","questionId")
);

-- CreateIndex
CREATE INDEX "ExamItemStat_exam_flag_idx" ON "ExamItemStat"("exam", "flag");

-- CreateIndex
CREATE INDEX "SpeakingSubmission_audioPurgedAt_createdAt_idx" ON "SpeakingSubmission"("audioPurgedAt", "createdAt");

