import { expect, test } from "@playwright/test";

import { adminLogin } from "./helpers";

/** Admin del banco de examenes: inventario, lista de bloques y detalle con la clave. */

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
