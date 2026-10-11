/**
 * Autenticacion (Better Auth): correo + contraseña con verificacion obligatoria,
 * recuperacion de contraseña, limite de intentos y Turnstile en el registro.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins";

import { canonicalEmail } from "@/lib/email-canonical";
import { db } from "@/server/db";
import { resetPasswordEmail, sendEmail, verificationEmail } from "@/server/email";

const appUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "MyPAL",
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordEmail(user.email, user.name, url));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verificationEmail(user.email, user.name, url));
    },
  },

  user: {
    additionalFields: {
      role: { type: "string", input: false, required: false, defaultValue: "STUDENT" },
      emailCanonical: { type: "string", input: false, required: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, emailCanonical: canonicalEmail(user.email), role: "STUDENT" },
        }),
        after: async (user) => {
          // Toda cuenta nace con su billetera de minutos (en cero).
          await db.minuteWallet.upsert({
            where: { userId: user.id },
            create: { userId: user.id },
            update: {},
          });
        },
      },
    },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 300, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
    },
  },

  plugins: [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
      endpoints: ["/sign-up/email", "/request-password-reset"],
    }),
    // Debe ir al final: permite fijar cookies desde Server Actions.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
