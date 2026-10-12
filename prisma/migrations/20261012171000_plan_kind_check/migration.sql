-- Los productos de examen no incluyen minutos con el avatar.
ALTER TABLE "Plan" DROP CONSTRAINT "plan_positive";
ALTER TABLE "Plan" ADD CONSTRAINT "plan_positive" CHECK (
  "priceUsdCents" > 0
  AND (
    ("kind" = 'TUTOR' AND "monthlySeconds" > 0 AND "perSessionCapSeconds" > 0)
    OR ("kind" IN ('EXAM', 'EXAM_ADDON') AND "monthlySeconds" >= 0 AND "perSessionCapSeconds" >= 0 AND "examQuotas" IS NOT NULL)
  )
);
