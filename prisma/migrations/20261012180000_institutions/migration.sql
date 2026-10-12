
-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('COMPANY', 'SCHOOL', 'UNIVERSITY');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('ORG_ADMIN', 'TEACHER', 'STUDENT');

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "assignmentId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "taxId" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "enabledExams" "ExamCode"[],
    "thresholds" JSONB NOT NULL DEFAULT '{"riskBandGap": 0.5, "inactiveDays": 7}',
    "allowsMinors" BOOLEAN NOT NULL DEFAULT false,
    "minorsDeclarationAt" TIMESTAMP(3),
    "avatarForMinors" BOOLEAN NOT NULL DEFAULT false,
    "cameraAllowed" BOOLEAN NOT NULL DEFAULT true,
    "recordingsRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "birthDate" TIMESTAMP(3),
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "licenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgLicense" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "priceUsdCents" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exam" "ExamCode" NOT NULL,
    "targetDate" TIMESTAMP(3),
    "targetScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTeacher" (
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "GroupTeacher_pkey" PRIMARY KEY ("groupId","memberId")
);

-- CreateTable
CREATE TABLE "GroupStudent" (
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupStudent_pkey" PRIMARY KEY ("groupId","memberId")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "groupId" TEXT,
    "code" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "birthDate" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "formId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentResult" (
    "assignmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptId" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssignmentResult_pkey" PRIMARY KEY ("assignmentId","memberId")
);

-- CreateTable
CREATE TABLE "TeacherReview" (
    "id" BIGSERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerMemberId" TEXT NOT NULL,
    "aiScore" DOUBLE PRECISION,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupStatsSnapshot" (
    "groupId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "GroupStatsSnapshot_pkey" PRIMARY KEY ("groupId","day")
);

-- CreateTable
CREATE TABLE "AccessRule" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "limits" JSONB,
    "reason" TEXT NOT NULL,
    "authorId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationFlag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "refId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ModerationFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionLead" (
    "id" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "students" INTEGER NOT NULL,
    "exams" TEXT[],
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstitutionLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrgMember_userId_idx" ON "OrgMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_orgId_userId_key" ON "OrgMember"("orgId", "userId");

-- CreateIndex
CREATE INDEX "OrgLicense_orgId_periodEnd_idx" ON "OrgLicense"("orgId", "periodEnd");

-- CreateIndex
CREATE INDEX "Group_orgId_idx" ON "Group"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_code_key" ON "Invitation"("code");

-- CreateIndex
CREATE INDEX "Invitation_orgId_idx" ON "Invitation"("orgId");

-- CreateIndex
CREATE INDEX "Assignment_groupId_closesAt_idx" ON "Assignment"("groupId", "closesAt");

-- CreateIndex
CREATE INDEX "TeacherReview_submissionId_createdAt_idx" ON "TeacherReview"("submissionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRule_scope_scopeId_resource_key" ON "AccessRule"("scope", "scopeId", "resource");

-- CreateIndex
CREATE INDEX "ModerationFlag_status_createdAt_idx" ON "ModerationFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InstitutionLead_status_createdAt_idx" ON "InstitutionLead"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgLicense" ADD CONSTRAINT "OrgLicense_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacher" ADD CONSTRAINT "GroupTeacher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTeacher" ADD CONSTRAINT "GroupTeacher_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrgMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStudent" ADD CONSTRAINT "GroupStudent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupStudent" ADD CONSTRAINT "GroupStudent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrgMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentResult" ADD CONSTRAINT "AssignmentResult_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reglas de la base de datos para instituciones
ALTER TABLE "OrgLicense" ADD CONSTRAINT "org_license_seats" CHECK ("seats" > 0 AND "used" >= 0 AND "used" <= "seats" AND "priceUsdCents" > 0);
ALTER TABLE "Invitation" ADD CONSTRAINT "invitation_uses" CHECK ("maxUses" > 0 AND "uses" >= 0 AND "uses" <= "maxUses");
-- Edad minima de 15 anios respecto de la fecha de alta (la edad actual la valida la aplicacion).
ALTER TABLE "OrgMember" ADD CONSTRAINT "org_member_min_age" CHECK ("birthDate" IS NULL OR "birthDate" <= "createdAt" - INTERVAL '15 years');
-- Las revisiones del docente no se editan ni se borran: la mas reciente es la vigente.
CREATE TRIGGER "teacher_review_append_only" BEFORE UPDATE OR DELETE ON "TeacherReview"
  FOR EACH ROW EXECUTE FUNCTION exam_append_only();
