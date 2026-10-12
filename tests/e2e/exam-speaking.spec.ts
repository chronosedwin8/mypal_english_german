import { expect, test } from "@playwright/test";

import { adminLogin } from "./helpers";

/**
 * Speaking Part 2 con el microfono simulado de Chrome (un tono). Usa la voz real del
 * examinador y Scribe; la calificacion la hace el worker.
 */
test("Speaking Part 2: tarjeta, preparacion, grabacion y calificacion", async ({ page }) => {
  test.setTimeout(240_000);
  await adminLogin(page);
  await page.goto("/app/examenes");
  await expect(page.getByRole("heading", { name: "Exámenes", level: 1 })).toBeVisible({ timeout: 90_000 });
  const speaking = page.locator("div", { hasText: "Speaking con examinador por voz" }).last();
  await speaking.getByRole("button", { name: "Part 2", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/speaking\//, { timeout: 60_000 });

  await page.getByRole("button", { name: /Activar y empezar/ }).click();
  await expect(page.getByText(/^Prepárate · \d+ s$/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("You should say:")).toBeVisible();
  await page.screenshot({ path: "test-results/speaking-card.png" });
  await page.getByRole("button", { name: "Empezar a hablar" }).click();
  await expect(page.getByText(/Grabando tu respuesta/)).toBeVisible();
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: "Terminé" }).click();

  // Pregunta de cierre de la Parte 2
  await expect(page.getByText(/Grabando tu respuesta/)).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Terminé" }).click();

  await expect(page.getByText(/Calificando tu Speaking|Banda estimada de Speaking/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Banda estimada de Speaking")).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: "test-results/speaking-result.png", fullPage: true });
});
