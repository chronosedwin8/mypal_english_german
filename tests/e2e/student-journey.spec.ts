import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/** Recorrido completo del estudiante, con Tavus y pagos simulados. */

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

test("landing: hero, precios y llamado al test gratis", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("tutor");
  await expect(page.getByText("$25", { exact: true })).toBeVisible();
  await expect(page.getByText("$69", { exact: true })).toBeVisible();
  await expect(page.getByText("$135", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Haz tu test de nivel gratis/ }).click();
  await expect(page).toHaveURL(/test-de-nivel/);
});

test("registro → test de nivel → clase gratis → paywall → compra", async ({ page }) => {
  // Sin "+etiqueta": el antiabuso trata a+x@ y a+y@ como el mismo correo.
  const email = `e2e${Date.now()}@example.com`;

  // 1) Registro y verificacion
  await page.goto("/registro");
  await page.fill("#name", "Laura Gómez");
  await page.fill("#email", email);
  await page.fill("#password", "ClaveSegura123");
  await page.locator('[data-slot="checkbox"]').first().click();
  await waitTurnstile(page);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/verifica-tu-correo/, { timeout: 30_000 });
  await page.goto(verificationLink(email));
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText("Primero, tu test de nivel gratis")).toBeVisible();

  // 2) Test de nivel (sin la parte oral, para no gastar en ElevenLabs)
  await page.goto("/test-de-nivel");
  await page.getByRole("radio", { name: /Inglés americano/ }).click();
  await waitTurnstile(page);
  await page.getByRole("button", { name: /Empezar el test/ }).click();
  for (let n = 1; n <= 20; n++) {
    await page.getByText(new RegExp(`^Pregunta ${n}$`)).or(page.getByText(/^Parte oral ·/)).first().waitFor();
    if (await page.getByText(/^Parte oral ·/).count()) break;
    const listen = page.getByRole("button", { name: "Reproducir audio" });
    if (await listen.count()) await listen.click();
    await page.locator("button:has(span.inline-grid)").first().click();
  }
  await page.getByText(/Saltar la parte oral/).click();
  await expect(page).toHaveURL(/resultado/, { timeout: 30_000 });
  await expect(page.getByText("tu nivel estimado")).toBeVisible();

  // 3) Clase gratis (simulada)
  await page.goto("/app/clase?idioma=EN_US");
  await page.locator('[data-slot="checkbox"]').first().click();
  await waitTurnstile(page);
  await page.getByRole("button", { name: /Empezar la clase/ }).click();
  await expect(page.getByText("En clase")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("GRATIS", { exact: true })).toBeVisible();
  await expect(page.getByText(/Nueva palabra: mug/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Terminar/ }).click();

  // 4) Resumen con paywall
  // En desarrollo la primera compilacion de cada ruta puede tardar.
  await expect(page.getByRole("heading", { name: /Buen trabajo/ })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("¿Te gustó? Sigue practicando")).toBeVisible();
  await expect(page.getByText("mug").first()).toBeVisible();

  // 5) Una segunda prueba no es posible: paywall
  await page.goto("/app/planes");
  await page.getByRole("button", { name: "Elegir Fluido" }).click();
  await expect(page).toHaveURL(/\/app\/pagar/);
  await page.getByRole("button", { name: /Pagar \(simulado\)/ }).click();
  await expect(page.getByText("¡Pago confirmado!")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Tienes 1 h disponibles/)).toBeVisible();
});
