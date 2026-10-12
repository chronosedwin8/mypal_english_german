"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { planById, topupById } from "@/lib/pricing/catalog";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { applyPaymentEvent, hasActivePlan } from "@/server/payments/apply-event";
import { FAKE_PROVIDER_ID, fakePayments } from "@/server/payments/fake-provider";

const Item = z.object({ kind: z.enum(["plan", "topup"]), itemId: z.string().min(1).max(40) });

export async function startCheckout(formData: FormData) {
  const user = await requireUser("/app/planes");
  const { kind, itemId } = Item.parse({ kind: formData.get("kind"), itemId: formData.get("itemId") });
  const plan = kind === "plan" ? planById(itemId) : undefined;
  if (kind === "plan" && !plan) throw new Error("Plan desconocido");
  // El Pase de examen es un complemento de un plan con tutor.
  if (plan?.kind === "EXAM_ADDON" && !(await hasActivePlan(user.id))) redirect("/app/planes?motivo=pase-sin-plan#examenes");
  if (kind === "topup") {
    if (!topupById(itemId)) throw new Error("Recarga desconocida");
    if (!(await hasActivePlan(user.id))) redirect("/app/planes?motivo=recarga-sin-plan");
  }
  const { url } = await fakePayments.createCheckout({ userId: user.id, kind, itemId });
  redirect(url);
}

export async function confirmFakePayment(formData: FormData) {
  const user = await requireUser("/app/planes");
  const ref = String(formData.get("ref") ?? "");
  const sig = String(formData.get("sig") ?? "");
  const parsed = fakePayments.parseCheckout(ref, sig, user.id);
  if (!parsed) redirect("/app/planes?motivo=pago-invalido");
  await fakePayments.completeCheckout(ref, user.id);
  revalidatePath("/app", "layout");
  redirect(`/app/planes?pagado=${parsed.kind}`);
}

export async function cancelSubscription(formData: FormData) {
  const user = await requireUser("/app/planes");
  const subscriptionId = z.string().min(1).parse(formData.get("subscriptionId"));
  const sub = await db.subscription.findFirst({ where: { id: subscriptionId, userId: user.id, status: { in: ["ACTIVE", "PAST_DUE"] } } });
  if (!sub) redirect("/app/planes");
  await applyPaymentEvent({
    type: "SUBSCRIPTION_CANCEL_REQUESTED",
    provider: sub.provider === FAKE_PROVIDER_ID ? FAKE_PROVIDER_ID : sub.provider,
    eventId: `cancel_${sub.id}_${Date.now()}`,
    externalSubscriptionId: sub.externalId,
    atPeriodEnd: true,
  });
  revalidatePath("/app", "layout");
  redirect("/app/planes?cancelado=1");
}
