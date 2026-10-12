
-- DropIndex
DROP INDEX "one_live_subscription";

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "examQuotas" JSONB,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TUTOR';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TUTOR';

-- CreateIndex
CREATE UNIQUE INDEX "one_live_subscription_per_kind" ON "Subscription"("userId", "kind") WHERE (status = ANY (ARRAY['ACTIVE'::"SubStatus", 'PAST_DUE'::"SubStatus"]));

