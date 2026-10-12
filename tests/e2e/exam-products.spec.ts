import { expect, test } from "@playwright/test";

import { signUp } from "./helpers";

test("landing con exámenes y página por examen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /IELTS, Goethe y TestDaF/ })).toBeVisible({ timeout: 90_000 });
  await page.locator("#examenes").screenshot({ path: "test-results/home-examenes.png" });
  await page.goto("/ielts-academic");
  await expect(page.getByRole("heading", { level: 1, name: "Prepárate para IELTS Academic" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Haz una práctica gratis").first()).toBeVisible();
  await page.screenshot({ path: "test-results/ielts-page.png", fullPage: true });
  await page.goto("/goethe-b2");
  await expect(page.getByText("Próximamente").first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/no-existe");
  await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible({ timeout: 60_000 });
});

test("comprar el Plan Examen (simulado) y ver los cupos", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/planes#examenes");
  await expect(page.getByRole("heading", { name: /Preparación de exámenes/ })).toBeVisible({ timeout: 60_000 });
  // El Pase es complemento: sin plan con tutor queda bloqueado
  await expect(page.getByRole("button", { name: "Requiere plan con tutor" })).toBeDisabled();
  await page.getByRole("button", { name: "Elegir Plan Examen" }).click();
  await expect(page).toHaveURL(/\/app\/pagar/, { timeout: 60_000 });
  await expect(page.getByText(/2 simulacros, 8 correcciones de Writing y 10 partes de Speaking/)).toBeVisible();
  await page.getByRole("button", { name: /Pagar|Confirmar/ }).click();
  await expect(page.getByText(/Te quedan 2 simulacros, 8 correcciones de Writing y 10 partes de Speaking/)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/planes-examen.png", fullPage: true });
  await page.goto("/app/examenes");
  await expect(page.getByText("Te quedan 2 simulacros.")).toBeVisible({ timeout: 60_000 });
});
