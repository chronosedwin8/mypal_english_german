-- CreateEnum
CREATE TYPE "TargetLang" AS ENUM ('EN_US', 'EN_GB', 'DE');

-- CreateEnum
CREATE TYPE "BaseLang" AS ENUM ('EN', 'DE');

-- CreateEnum
CREATE TYPE "Cefr" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "BucketSource" AS ENUM ('TRIAL', 'PLAN_CYCLE', 'ADMIN_GRANT', 'TOPUP');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('GRANT', 'HOLD', 'CAPTURE', 'RELEASE', 'EXPIRE', 'CLAWBACK', 'ADJUST');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('RESERVED', 'CREATING', 'READY', 'LIVE', 'ENDING', 'ENDED', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "EndReason" AS ENUM ('USER_END', 'TAB_CLOSE', 'CLIENT_LEFT', 'TAVUS_SHUTDOWN', 'DEADLINE', 'NO_SHOW', 'HEARTBEAT_LOST', 'ADMIN', 'CREATE_FAILED', 'ORPHAN');

-- CreateEnum
CREATE TYPE "SlotState" AS ENUM ('FREE', 'OFFERED', 'BUSY', 'DISABLED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'OFFERED', 'CLAIMED', 'EXPIRED', 'CANCELLED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'TOPUP');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('GRAMMAR', 'VOCAB', 'READING', 'LISTENING');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "emailCanonical" TEXT,
    "bannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanguageProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" "TargetLang" NOT NULL,
    "level" "Cefr",
    "levelSource" TEXT,
    "theta" DOUBLE PRECISION,
    "skillScores" JSONB,
    "memoryTag" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastPracticeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LanguageProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "priceUsdCents" INTEGER NOT NULL,
    "monthlySeconds" INTEGER NOT NULL,
    "perSessionCapSeconds" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopupPack" (
    "id" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "priceUsdCents" INTEGER NOT NULL,
    "seconds" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 90,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopupPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "SubStatus" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "topupPackId" TEXT,
    "amountUsdCents" INTEGER NOT NULL,
    "feeUsdCents" INTEGER NOT NULL DEFAULT 0,
    "netUsdCents" INTEGER NOT NULL,
    "refundedUsdCents" INTEGER NOT NULL DEFAULT 0,
    "secondsGranted" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateTable
CREATE TABLE "MinuteWallet" (
    "userId" TEXT NOT NULL,
    "availableSeconds" INTEGER NOT NULL DEFAULT 0,
    "heldSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinuteWallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MinuteBucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "BucketSource" NOT NULL,
    "priority" INTEGER NOT NULL,
    "grantedSeconds" INTEGER NOT NULL,
    "heldSeconds" INTEGER NOT NULL DEFAULT 0,
    "consumedSeconds" INTEGER NOT NULL DEFAULT 0,
    "expiredSeconds" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "grantKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinuteBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "LedgerType" NOT NULL,
    "seconds" INTEGER NOT NULL,
    "deltaAvailable" INTEGER NOT NULL,
    "deltaHeld" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionHold" (
    "sessionId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "allocOrder" INTEGER NOT NULL,
    "heldSeconds" INTEGER NOT NULL,
    "capturedSeconds" INTEGER NOT NULL DEFAULT 0,
    "releasedSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SessionHold_pkey" PRIMARY KEY ("sessionId","bucketId")
);

-- CreateTable
CREATE TABLE "TutorSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" "TargetLang" NOT NULL,
    "lessonId" TEXT,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "status" "SessionStatus" NOT NULL DEFAULT 'RESERVED',
    "clientRequestId" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "slotId" INTEGER,
    "palId" TEXT NOT NULL,
    "conversationName" TEXT NOT NULL,
    "tavusConversationId" TEXT,
    "conversationUrl" TEXT,
    "meetingToken" TEXT,
    "reservedSeconds" INTEGER NOT NULL,
    "maxCallDurationSec" INTEGER NOT NULL,
    "createRequestedAt" TIMESTAMP(3),
    "tavusCreatedAt" TIMESTAMP(3),
    "hardDeadlineAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "endRequestedAt" TIMESTAMP(3),
    "endReason" "EndReason",
    "tavusEndedAt" TIMESTAMP(3),
    "endObservedAt" TIMESTAMP(3),
    "shutdownReason" TEXT,
    "billedSeconds" INTEGER,
    "chargedSeconds" INTEGER,
    "uncollectedSeconds" INTEGER NOT NULL DEFAULT 0,
    "costPerMinMicroUsd" INTEGER NOT NULL,
    "costMicroUsd" BIGINT,
    "failureCode" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcurrencySlot" (
    "id" INTEGER NOT NULL,
    "state" "SlotState" NOT NULL DEFAULT 'FREE',
    "sessionId" TEXT,
    "queueEntryId" TEXT,
    "offeredUntil" TIMESTAMP(3),
    "changedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConcurrencySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionQueueEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" "TargetLang" NOT NULL,
    "lessonId" TEXT,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TavusEvent" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" TEXT,
    "conversationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTs" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TavusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "sessionId" TEXT NOT NULL,
    "turns" JSONB NOT NULL,
    "perceptionAnalysis" TEXT,
    "summaryEs" TEXT,
    "fetchedVia" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "SessionCorrection" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "corrected" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" "TargetLang" NOT NULL,
    "term" TEXT NOT NULL,
    "termNormalized" TEXT NOT NULL,
    "translationEs" TEXT,
    "example" TEXT,
    "source" TEXT NOT NULL,
    "sessionId" TEXT,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticItem" (
    "id" TEXT NOT NULL,
    "lang" "BaseLang" NOT NULL,
    "skill" "Skill" NOT NULL,
    "level" "Cefr" NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "stem" TEXT NOT NULL,
    "passage" TEXT,
    "audioText" TEXT,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanationEs" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timesServed" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DiagnosticItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT,
    "language" "TargetLang" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "theta" DOUBLE PRECISION NOT NULL DEFAULT -1.0,
    "thetaSe" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "resultLevel" "Cefr",
    "skillScores" JSONB,
    "speakingScore" DOUBLE PRECISION,
    "speakingCount" INTEGER NOT NULL DEFAULT 0,
    "ipPrefixHash" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DiagnosticAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticResponse" (
    "attemptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "chosenIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "thetaAfter" DOUBLE PRECISION NOT NULL,
    "seAfter" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticResponse_pkey" PRIMARY KEY ("attemptId","itemId")
);

-- CreateTable
CREATE TABLE "SpeakingSample" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "wordsPerMinute" DOUBLE PRECISION,
    "uniqueWords" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeakingSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "lang" "BaseLang" NOT NULL,
    "level" "Cefr" NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "descriptionEs" TEXT NOT NULL,
    "emoji" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "objectives" TEXT[],
    "targetVocab" TEXT[],
    "tutorBrief" TEXT NOT NULL,
    "usesVision" BOOLEAN NOT NULL DEFAULT false,
    "suggestedMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "sessionsCount" INTEGER NOT NULL DEFAULT 0,
    "lastSessionAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("userId","lessonId")
);

-- CreateTable
CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailCanonical" TEXT NOT NULL,
    "deviceIdHash" TEXT NOT NULL,
    "ipPrefixHash" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TavusPal" (
    "variant" "TargetLang" NOT NULL,
    "palId" TEXT NOT NULL,
    "faceId" TEXT NOT NULL,
    "basePalId" TEXT NOT NULL,
    "palName" TEXT NOT NULL,
    "specHash" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "TavusPal_pkey" PRIMARY KEY ("variant")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_emailCanonical_key" ON "user"("emailCanonical");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LanguageProfile_memoryTag_key" ON "LanguageProfile"("memoryTag");

-- CreateIndex
CREATE UNIQUE INDEX "LanguageProfile_userId_language_key" ON "LanguageProfile"("userId", "language");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_provider_externalId_key" ON "Subscription"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "one_live_subscription" ON "Subscription"("userId") WHERE (status IN ('ACTIVE','PAST_DUE'));

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_externalId_key" ON "Payment"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MinuteBucket_grantKey_key" ON "MinuteBucket"("grantKey");

-- CreateIndex
CREATE UNIQUE INDEX "MinuteBucket_paymentId_key" ON "MinuteBucket"("paymentId");

-- CreateIndex
CREATE INDEX "MinuteBucket_userId_expiresAt_idx" ON "MinuteBucket"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "one_trial_bucket_per_user" ON "MinuteBucket"("userId") WHERE (source = 'TRIAL');

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_sessionId_idx" ON "LedgerEntry"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorSession_queueEntryId_key" ON "TutorSession"("queueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorSession_conversationName_key" ON "TutorSession"("conversationName");

-- CreateIndex
CREATE UNIQUE INDEX "TutorSession_tavusConversationId_key" ON "TutorSession"("tavusConversationId");

-- CreateIndex
CREATE INDEX "TutorSession_status_hardDeadlineAt_idx" ON "TutorSession"("status", "hardDeadlineAt");

-- CreateIndex
CREATE INDEX "TutorSession_userId_createdAt_idx" ON "TutorSession"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TutorSession_userId_clientRequestId_key" ON "TutorSession"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "one_open_session_per_user" ON "TutorSession"("userId") WHERE (status IN ('RESERVED','CREATING','READY','LIVE','ENDING'));

-- CreateIndex
CREATE UNIQUE INDEX "one_trial_session_per_user" ON "TutorSession"("userId") WHERE ("isTrial" AND status <> 'FAILED');

-- CreateIndex
CREATE UNIQUE INDEX "ConcurrencySlot_sessionId_key" ON "ConcurrencySlot"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ConcurrencySlot_queueEntryId_key" ON "ConcurrencySlot"("queueEntryId");

-- CreateIndex
CREATE INDEX "SessionQueueEntry_status_createdAt_idx" ON "SessionQueueEntry"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "one_active_queue_entry" ON "SessionQueueEntry"("userId") WHERE (status IN ('WAITING','OFFERED'));

-- CreateIndex
CREATE UNIQUE INDEX "TavusEvent_dedupeKey_key" ON "TavusEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "TavusEvent_sessionId_idx" ON "TavusEvent"("sessionId");

-- CreateIndex
CREATE INDEX "SessionCorrection_userId_createdAt_idx" ON "SessionCorrection"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabularyItem_userId_language_dueAt_idx" ON "VocabularyItem"("userId", "language", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyItem_userId_language_termNormalized_key" ON "VocabularyItem"("userId", "language", "termNormalized");

-- CreateIndex
CREATE INDEX "DiagnosticItem_lang_isActive_difficulty_idx" ON "DiagnosticItem"("lang", "isActive", "difficulty");

-- CreateIndex
CREATE INDEX "DiagnosticAttempt_userId_idx" ON "DiagnosticAttempt"("userId");

-- CreateIndex
CREATE INDEX "DiagnosticAttempt_anonId_idx" ON "DiagnosticAttempt"("anonId");

-- CreateIndex
CREATE INDEX "DiagnosticAttempt_ipPrefixHash_startedAt_idx" ON "DiagnosticAttempt"("ipPrefixHash", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticResponse_attemptId_seq_key" ON "DiagnosticResponse"("attemptId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakingSample_attemptId_taskId_key" ON "SpeakingSample"("attemptId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Module_lang_slug_key" ON "Module"("lang", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_moduleId_slug_key" ON "Lesson"("moduleId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TrialClaim_userId_key" ON "TrialClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrialClaim_emailCanonical_key" ON "TrialClaim"("emailCanonical");

-- CreateIndex
CREATE UNIQUE INDEX "TrialClaim_deviceIdHash_key" ON "TrialClaim"("deviceIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "TrialClaim_sessionId_key" ON "TrialClaim"("sessionId");

-- CreateIndex
CREATE INDEX "TrialClaim_ipPrefixHash_createdAt_idx" ON "TrialClaim"("ipPrefixHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TavusPal_palId_key" ON "TavusPal"("palId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanguageProfile" ADD CONSTRAINT "LanguageProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteWallet" ADD CONSTRAINT "MinuteWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteBucket" ADD CONSTRAINT "MinuteBucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionHold" ADD CONSTRAINT "SessionHold_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionHold" ADD CONSTRAINT "SessionHold_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "MinuteBucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQueueEntry" ADD CONSTRAINT "SessionQueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCorrection" ADD CONSTRAINT "SessionCorrection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCorrection" ADD CONSTRAINT "SessionCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyItem" ADD CONSTRAINT "VocabularyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticAttempt" ADD CONSTRAINT "DiagnosticAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticResponse" ADD CONSTRAINT "DiagnosticResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DiagnosticAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticResponse" ADD CONSTRAINT "DiagnosticResponse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DiagnosticItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakingSample" ADD CONSTRAINT "SpeakingSample_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DiagnosticAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialClaim" ADD CONSTRAINT "TrialClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- money_guards: la base de datos impide gastar mas segundos de los otorgados.
-- (Prisma no modela CHECKs; los declara esta migracion escrita a mano.)
-- ============================================================================
ALTER TABLE "MinuteWallet" ADD CONSTRAINT "wallet_nonneg"
  CHECK ("availableSeconds" >= 0 AND "heldSeconds" >= 0);

ALTER TABLE "MinuteBucket" ADD CONSTRAINT "bucket_bounds"
  CHECK ("grantedSeconds" >= 0 AND "heldSeconds" >= 0 AND "consumedSeconds" >= 0 AND "expiredSeconds" >= 0
         AND "heldSeconds" + "consumedSeconds" + "expiredSeconds" <= "grantedSeconds");

ALTER TABLE "SessionHold" ADD CONSTRAINT "hold_bounds"
  CHECK ("heldSeconds" > 0 AND "capturedSeconds" >= 0 AND "releasedSeconds" >= 0
         AND "capturedSeconds" + "releasedSeconds" <= "heldSeconds");

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "ledger_positive" CHECK ("seconds" > 0);

ALTER TABLE "TutorSession" ADD CONSTRAINT "session_seconds_nonneg"
  CHECK ("reservedSeconds" >= 0 AND "maxCallDurationSec" >= 0
         AND ("billedSeconds" IS NULL OR "billedSeconds" >= 0)
         AND ("chargedSeconds" IS NULL OR "chargedSeconds" >= 0));

ALTER TABLE "Plan" ADD CONSTRAINT "plan_positive"
  CHECK ("priceUsdCents" > 0 AND "monthlySeconds" > 0 AND "perSessionCapSeconds" > 0);

ALTER TABLE "TopupPack" ADD CONSTRAINT "topup_positive"
  CHECK ("priceUsdCents" > 0 AND "seconds" > 0 AND "validityDays" > 0);

-- El ledger es de solo-insercion: se bloquea UPDATE/DELETE con un trigger.
CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry es de solo-insercion (% bloqueado)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_no_update_delete"
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
