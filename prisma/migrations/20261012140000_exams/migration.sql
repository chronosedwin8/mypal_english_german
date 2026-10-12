-- CreateEnum
CREATE TYPE "ExamCode" AS ENUM ('IELTS_ACADEMIC', 'GOETHE_B1', 'GOETHE_B2', 'GOETHE_C1', 'TESTDAF');

-- CreateEnum
CREATE TYPE "ExamSection" AS ENUM ('LISTENING', 'READING', 'WRITING', 'SPEAKING');

-- CreateEnum
CREATE TYPE "ItemSetStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ExamMode" AS ENUM ('DRILL', 'PART', 'SECTION', 'WRITING', 'SPEAKING', 'REVIEW', 'ENTRY', 'MOCK');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SCORING', 'COMPLETED', 'ABANDONED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ExamJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExamQuotaKind" AS ENUM ('MOCK', 'WRITING', 'SPEAKING');

-- CreateTable
CREATE TABLE "ExamItemSet" (
    "id" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "section" "ExamSection" NOT NULL,
    "part" INTEGER NOT NULL,
    "taskTypes" TEXT[],
    "difficulty" DOUBLE PRECISION NOT NULL,
    "topic" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "answerKey" JSONB NOT NULL,
    "status" "ItemSetStatus" NOT NULL DEFAULT 'DRAFT',
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION,
    "reviewNote" TEXT,
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "timesServed" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ExamItemSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioAsset" (
    "id" TEXT NOT NULL,
    "itemSetId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "voices" JSONB NOT NULL,
    "script" JSONB NOT NULL,
    "transcriptCheck" DOUBLE PRECISION,
    "characters" INTEGER NOT NULL,
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamForm" (
    "id" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "version" INTEGER NOT NULL,
    "blocks" JSONB NOT NULL,
    "conversion" JSONB,
    "calibrated" BOOLEAN NOT NULL DEFAULT false,
    "status" "ItemSetStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "mode" "ExamMode" NOT NULL,
    "formId" TEXT,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "config" JSONB NOT NULL,
    "scores" JSONB,
    "overall" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSectionAttempt" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "section" "ExamSection" NOT NULL,
    "part" INTEGER NOT NULL DEFAULT 0,
    "itemSetIds" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "correct" INTEGER,
    "total" INTEGER,
    "score" DOUBLE PRECISION,
    "audioPlays" JSONB NOT NULL DEFAULT '{}',
    "tabSwitches" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExamSectionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamResponse" (
    "attemptId" TEXT NOT NULL,
    "itemSetId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "timeMs" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamResponse_pkey" PRIMARY KEY ("attemptId","itemSetId","questionId")
);

-- CreateTable
CREATE TABLE "WritingSubmission" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "itemSetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "words" INTEGER NOT NULL,
    "grades" JSONB NOT NULL DEFAULT '[]',
    "finalScore" DOUBLE PRECISION,
    "feedback" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "WritingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakingSubmission" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "part" INTEGER NOT NULL,
    "itemSetId" TEXT,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "transcript" TEXT NOT NULL DEFAULT '',
    "metrics" JSONB,
    "grades" JSONB NOT NULL DEFAULT '[]',
    "finalScore" DOUBLE PRECISION,
    "feedback" JSONB,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "SpeakingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamReport" (
    "attemptId" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "timing" JSONB NOT NULL,
    "narrative" TEXT NOT NULL,
    "improvements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamReport_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "StudyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "targets" JSONB NOT NULL,
    "examDate" TIMESTAMP(3),
    "hoursPerWeek" INTEGER NOT NULL,
    "days" INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "section" "ExamSection",
    "taskType" TEXT,
    "minutes" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "origin" TEXT NOT NULL DEFAULT 'INITIAL',
    "sourceAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillMastery" (
    "userId" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "se" DOUBLE PRECISION NOT NULL,
    "n" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillMastery_pkey" PRIMARY KEY ("userId","exam","key")
);

-- CreateTable
CREATE TABLE "ItemExposure" (
    "userId" TEXT NOT NULL,
    "itemSetId" TEXT NOT NULL,
    "mode" "ExamMode" NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemExposure_pkey" PRIMARY KEY ("userId","itemSetId","mode")
);

-- CreateTable
CREATE TABLE "ExamEntitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ExamQuotaKind" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "granted" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamUsageEvent" (
    "id" BIGSERIAL NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ExamQuotaKind" NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "attemptId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" BIGSERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "characters" INTEGER NOT NULL DEFAULT 0,
    "seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "userId" TEXT,
    "refId" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ExamJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "error" TEXT,
    "result" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "scores" JSONB NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamItemSet_exam_section_part_status_difficulty_idx" ON "ExamItemSet"("exam", "section", "part", "status", "difficulty");

-- CreateIndex
CREATE INDEX "ExamItemSet_status_createdAt_idx" ON "ExamItemSet"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AudioAsset_storageKey_key" ON "AudioAsset"("storageKey");

-- CreateIndex
CREATE INDEX "AudioAsset_itemSetId_idx" ON "AudioAsset"("itemSetId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamForm_exam_version_key" ON "ExamForm"("exam", "version");

-- CreateIndex
CREATE INDEX "ExamAttempt_userId_exam_startedAt_idx" ON "ExamAttempt"("userId", "exam", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "one_open_mock_per_user" ON "ExamAttempt"("userId") WHERE ((mode = 'MOCK'::"ExamMode") AND (status = ANY (ARRAY['IN_PROGRESS'::"ExamAttemptStatus", 'SCORING'::"ExamAttemptStatus"])));

-- CreateIndex
CREATE UNIQUE INDEX "ExamSectionAttempt_attemptId_section_part_key" ON "ExamSectionAttempt"("attemptId", "section", "part");

-- CreateIndex
CREATE UNIQUE INDEX "WritingSubmission_attemptId_taskNumber_key" ON "WritingSubmission"("attemptId", "taskNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakingSubmission_attemptId_part_key" ON "SpeakingSubmission"("attemptId", "part");

-- CreateIndex
CREATE UNIQUE INDEX "one_active_plan_per_exam" ON "StudyPlan"("userId", "exam") WHERE (status = 'ACTIVE'::text);

-- CreateIndex
CREATE INDEX "StudyPlanItem_planId_weekStart_idx" ON "StudyPlanItem"("planId", "weekStart");

-- CreateIndex
CREATE INDEX "ItemExposure_userId_mode_idx" ON "ItemExposure"("userId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ExamEntitlement_sourceKey_key" ON "ExamEntitlement"("sourceKey");

-- CreateIndex
CREATE INDEX "ExamEntitlement_userId_kind_periodEnd_idx" ON "ExamEntitlement"("userId", "kind", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ExamUsageEvent_idempotencyKey_key" ON "ExamUsageEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ExamUsageEvent_userId_createdAt_idx" ON "ExamUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_purpose_createdAt_idx" ON "AiUsage"("purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamJob_dedupeKey_key" ON "ExamJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "ExamJob_status_runAfter_idx" ON "ExamJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "OfficialResult_userId_idx" ON "OfficialResult"("userId");

-- AddForeignKey
ALTER TABLE "AudioAsset" ADD CONSTRAINT "AudioAsset_itemSetId_fkey" FOREIGN KEY ("itemSetId") REFERENCES "ExamItemSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ExamForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSectionAttempt" ADD CONSTRAINT "ExamSectionAttempt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamResponse" ADD CONSTRAINT "ExamResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingSubmission" ADD CONSTRAINT "WritingSubmission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakingSubmission" ADD CONSTRAINT "SpeakingSubmission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamReport" ADD CONSTRAINT "ExamReport_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanItem" ADD CONSTRAINT "StudyPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemExposure" ADD CONSTRAINT "ItemExposure_itemSetId_fkey" FOREIGN KEY ("itemSetId") REFERENCES "ExamItemSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamEntitlement" ADD CONSTRAINT "ExamEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Reglas de examenes que impone la base de datos
-- ============================================================================
ALTER TABLE "ExamEntitlement" ADD CONSTRAINT "exam_entitlement_bounds"
  CHECK ("granted" >= 0 AND "used" >= 0 AND "reserved" >= 0 AND "used" + "reserved" <= "granted");

ALTER TABLE "ExamUsageEvent" ADD CONSTRAINT "exam_usage_positive" CHECK ("amount" > 0);

CREATE OR REPLACE FUNCTION exam_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% es de solo-insercion (% bloqueado)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exam_usage_no_update_delete"
  BEFORE UPDATE OR DELETE ON "ExamUsageEvent"
  FOR EACH ROW EXECUTE FUNCTION exam_append_only();

CREATE TRIGGER "ai_usage_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AiUsage"
  FOR EACH ROW EXECUTE FUNCTION exam_append_only();
