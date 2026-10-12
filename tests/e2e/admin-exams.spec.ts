import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/** Admin del banco de examenes: inventario, lista de bloques y detalle con la clave. */

async function waitTurnstile(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value?.length,
    null,
    { timeout: 30_000 },
  );
}

function verificationLink(email: string): string {
  const mails = JSON.parse(readFileSync(".dev-mail/outbox.json", "utf8")) as { to: string; actionUrl?: string }[];
  const mail = mails.find((m) => m.to === email);
  if (!mail?.actionUrl) throw new Error(`No llegó el correo de verificación a ${email}`);
  return mail.actionUrl;
}

async function adminLogin(page: Page) {
  const email = `admin${Date.now()}@example.com`;
  const password = "ClaveSegura123";
  await page.goto("/registro");
  await page.fill("#name", "Admin Pruebas");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.locator('[data-slot="checkbox"]').first().click();
  await waitTurnstile(page);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/verifica-tu-correo/, { timeout: 30_000 });
  await page.goto(verificationLink(email));
  await expect(page).toHaveURL(/\/app/);
  execSync(`pnpm -s admin:promote ${email}`, { stdio: "ignore" });
  // El rol nuevo se toma al volver a ingresar.
  await page.context().clearCookies();
  await page.goto("/ingresar");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
}

test("banco de examenes: inventario, bloques y detalle", async ({ page }) => {
  await adminLogin(page);

  await page.goto("/admin/examenes?estado=ALL");
  await expect(page.getByRole("heading", { name: "Banco de exámenes" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Inventario por parte")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generar" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/admin-examenes.png", fullPage: true });

  // Un bloque de Reading: texto, preguntas y clave con evidencia.
  const reading = page.locator("tr", { hasText: "Reading 1" }).getByRole("link").first();
  if (await reading.count()) {
    await reading.click();
    await expect(page.getByText("Control de calidad")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^Clave:/).first()).toBeVisible();
    await page.screenshot({ path: "test-results/admin-bloque-reading.png", fullPage: true });
    await page.goBack();
  }

  // Un bloque de Listening con audio firmado.
  const listening = page.locator("tr", { hasText: "Listening" }).filter({ hasText: /APPROVED|REVIEW/ }).getByRole("link").first();
  if (await listening.count()) {
    await listening.click();
    await expect(page.getByRole("heading", { name: "Guion" })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("audio").first()).toHaveAttribute("src", /^https:\/\/|^memory:/);
    await page.screenshot({ path: "test-results/admin-bloque-listening.png", fullPage: true });
  }

  // Writing Task 1 con su grafico dibujado.
  await page.goto("/admin/examenes?estado=ALL");
  await expect(page.getByRole("heading", { name: "Banco de exámenes" })).toBeVisible({ timeout: 60_000 });
  const writing = page.locator("tr", { hasText: "Writing 1" }).getByRole("link").first();
  if (await writing.count()) {
    await writing.click();
    await expect(page.locator("svg[role=img]").first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: "test-results/admin-bloque-writing.png", fullPage: true });
  }
});
