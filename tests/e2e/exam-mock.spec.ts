import { expect, test } from "@playwright/test";

import { adminLogin } from "./helpers";

/** Simulacro completo: abrir, hacer el Listening (entregar) y volver al simulacro con Reading como siguiente. */
test("simulacro: Listening en condiciones reales y orden de secciones", async ({ page }) => {
  test.setTimeout(240_000);
  await adminLogin(page);
  await page.goto("/app/examenes");
  await page.getByRole("button", { name: "Empezar simulacro" }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/simulacro\//, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Simulacro completo/ })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/mock-start.png", fullPage: true });

  await page.getByRole("button", { name: "Empezar Listening" }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/practica\//, { timeout: 60_000 });
  await expect(page.getByText(/Simulacro completo/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("timer")).toBeVisible();

  await page.getByRole("button", { name: "Entregar", exact: true }).click();
  await page.getByRole("button", { name: /Entregar ahora/ }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/simulacro\//, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Empezar Reading" })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/mock-after-listening.png", fullPage: true });
});
