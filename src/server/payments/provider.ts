/**
 * Interfaz de pasarela de pagos. Hoy: FakeProvider (checkout simulado).
 * Para Stripe / Mercado Pago / Wompi basta implementar esta interfaz y traducir
 * sus webhooks a NormalizedEvent; el resto del sistema no cambia.
 */
export type PaymentEvent =
  | {
      type: "CYCLE_PAID";
      provider: string;
      eventId: string;
      externalPaymentId: string;
      externalSubscriptionId: string;
      userId: string;
      planId: string;
      amountUsdCents: number;
      feeUsdCents: number;
      periodStart: Date;
      periodEnd: Date;
    }
  | {
      type: "TOPUP_PAID";
      provider: string;
      eventId: string;
      externalPaymentId: string;
      userId: string;
      topupId: string;
      amountUsdCents: number;
      feeUsdCents: number;
    }
  | {
      type: "SUBSCRIPTION_CANCEL_REQUESTED";
      provider: string;
      eventId: string;
      externalSubscriptionId: string;
      atPeriodEnd: boolean;
    }
  | {
      type: "PAYMENT_REFUNDED";
      provider: string;
      eventId: string;
      externalPaymentId: string;
    };

export interface CheckoutRequest {
  userId: string;
  kind: "plan" | "topup";
  itemId: string;
}

export interface PaymentProvider {
  readonly id: string;
  /** URL a la que se envia al usuario para pagar. */
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
}
