-- DropIndex
DROP INDEX "user_emailCanonical_key";

-- CreateIndex
CREATE INDEX "user_emailCanonical_idx" ON "user"("emailCanonical");
