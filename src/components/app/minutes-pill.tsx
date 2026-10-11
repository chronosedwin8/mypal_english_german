import { ClockIcon } from "lucide-react";
import Link from "next/link";

import { getCurrentUser } from "@/server/auth/dal";
import { getConfig } from "@/server/config";
import { db } from "@/server/db";
import { getBalance } from "@/server/ledger/wallet";

export async function MinutesPill() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [balance, claim, config] = await Promise.all([
    getBalance(user.id),
    db.trialClaim.findUnique({ where: { userId: user.id }, select: { id: true } }),
    getConfig(),
  ]);
  const minutes = Math.floor(balance.paidAvailableSeconds / 60);
  const hasFreeClass = balance.trialAvailableSeconds > 0 || (!claim && config["trial.enabled"]);
  return (
    <Link
      href="/app/planes"
      className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold shadow-sm hover:bg-muted"
      title="Minutos disponibles con tu tutor"
    >
      <ClockIcon className="size-4 text-primary" />
      {hasFreeClass && minutes === 0 ? "🎁 Clase gratis" : `${minutes} min`}
    </Link>
  );
}
