import { expect, test } from "@playwright/test";

import { signUp } from "./helpers";

/** Plan de estudios: crear con meta y fecha, ver tareas de la semana y la pagina de progreso. */
test("plan de estudios y progreso", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/examenes/plan");
  await expect(page.getByText("Crea tu plan en un minuto")).toBeVisible({ timeout: 90_000 });
  const date = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  await page.locator('select[name="target"]').selectOption("7");
  await page.fill('input[name="examDate"]', date);
  await page.fill('input[name="hoursPerWeek"]', "6");
  for (const d of ["Mar", "Jue", "Sáb", "Dom"]) await page.getByLabel(d).check();
  await page.getByRole("button", { name: "Crear mi plan" }).click();
  await expect(page.getByRole("heading", { name: "Esta semana" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Repaso de vocabulario: 10 minutos cada día de estudio").first()).toBeVisible();
  await page.screenshot({ path: "test-results/plan.png", fullPage: true });

  // Marcar una tarea como hecha
  await page.getByRole("button", { name: "Marcar como hecha" }).first().click();
  await expect(page.getByRole("button", { name: "Marcar como pendiente" }).first()).toBeVisible();

  await page.goto("/app/examenes/progreso");
  await expect(page.getByRole("heading", { name: /Mi progreso/ })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/progreso.png", fullPage: true });
});
