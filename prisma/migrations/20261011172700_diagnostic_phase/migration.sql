-- AlterTable
ALTER TABLE "DiagnosticAttempt" ADD COLUMN     "currentItemId" TEXT,
ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'ITEMS';
