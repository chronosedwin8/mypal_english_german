import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, type Page } from "@playwright/test";

export async function waitTurnstile(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value?.length,
    null,
    { timeout: 30_000 },
  );
}

export function verificationLink(email: string): string {
  const mails = JSON.parse(readFileSync(".dev-mail/outbox.json", "utf8")) as { to: string; actionUrl?: string }[];
  const mail = mails.find((m) => m.to === email);
  if (!mail?.actionUrl) throw new Error(`No llegó el correo de verificación a ${email}`);
  return mail.actionUrl;
}

/** Crea una cuenta verificada y deja la sesion abierta. */
export async function signUp(page: Page, prefix = "e2e") {
  const email = `${prefix}${Date.now()}@example.com`;
  const password = "ClaveSegura123";
  await page.goto("/registro");
  await page.fill("#name", "Prueba E2E");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.locator('[data-slot="checkbox"]').first().click();
  await waitTurnstile(page);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/verifica-tu-correo/, { timeout: 30_000 });
  await page.goto(verificationLink(email));
  await expect(page).toHaveURL(/\/app/);
  return { email, password };
}

/** Cuenta de administrador (el rol nuevo se toma al volver a ingresar). */
export async function adminLogin(page: Page) {
  const { email, password } = await signUp(page, "admin");
  execSync(`pnpm -s admin:promote ${email}`, { stdio: "ignore" });
  await page.context().clearCookies();
  await page.goto("/ingresar");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
}
