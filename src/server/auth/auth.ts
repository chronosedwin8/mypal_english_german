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
import { linkAnonymousAttempts } from "@/server/diagnostic/service";
import { resetPasswordEmail, sendEmail, verificationEmail } from "@/server/email";
import { ANON_COOKIE, readCookie } from "@/server/security";

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
    session: {
      create: {
        after: async (session, ctx) => {
          // Los tests de nivel hechos sin cuenta pasan a la cuenta al ingresar.
          const headers = ctx?.headers ?? ctx?.request?.headers;
          const anonId = headers ? readCookie(headers, ANON_COOKIE) : null;
          if (anonId) await linkAnonymousAttempts(session.userId, anonId).catch(() => 0);
        },
      },
    },
  },

  rateLimit: {
    // Activo en produccion (en local todas las pruebas vienen de la misma IP).
    enabled: process.env.NODE_ENV === "production" || process.env.FORCE_RATE_LIMIT === "true",
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
