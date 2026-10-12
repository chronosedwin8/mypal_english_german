import { expect, test } from "@playwright/test";

import { adminLogin, signUp } from "./helpers";

/** Operacion del admin: accesos, moderacion, costos, auditoria y el rol de soporte (solo lectura). */

test("accesos, moderación, costos, auditoría y rol de soporte", async ({ browser }) => {
  test.setTimeout(240_000);
  const studentPage = await (await browser.newContext()).newPage();
  const student = await signUp(studentPage, "soporte");

  const page = await (await browser.newContext()).newPage();
  await adminLogin(page);

  // Excepción de acceso por usuario.
  await page.goto("/admin/accesos");
  await expect(page.getByRole("heading", { name: "Accesos" })).toBeVisible({ timeout: 90_000 });
  await page.getByLabel("Ámbito").selectOption("USER");
  await page.fill('input[name="target"]', student.email);
  await page.getByLabel("Recurso").selectOption("exam.adhoc");
  await page.getByLabel("Decisión").selectOption("false");
  await page.fill('input[name="reason"]', "Prueba e2e de bloqueo");
  await page.getByRole("button", { name: "Guardar regla" }).click();
  await expect(page.getByText("Regla guardada.")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("tr", { hasText: student.email })).toContainText("Bloqueado");
  await page.screenshot({ path: "test-results/admin-accesos.png", fullPage: true });

  await page.goto("/admin/moderacion");
  await expect(page.getByRole("heading", { name: "Moderación y alertas" })).toBeVisible({ timeout: 60_000 });
  await page.goto("/admin/costos");
  await expect(page.getByRole("heading", { name: "Costos y presupuestos" })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/admin-costos.png", fullPage: true });

  await page.goto("/admin/auditoria?accion=access.");
  await expect(page.getByRole("cell", { name: "access.rule", exact: true }).first()).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exportar CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^auditoria-.*\.csv$/);

  // El estudiante pasa a soporte: entra al admin, ve el aviso y no puede cambiar nada.
  await page.goto(`/admin/usuarios?q=${encodeURIComponent(student.email)}`);
  await page.getByRole("link", { name: student.email }).click();
  await page.getByLabel("Rol").selectOption("SUPPORT");
  await page.getByRole("button", { name: "Cambiar rol" }).click();
  await expect(page.getByLabel("Rol")).toHaveValue("SUPPORT", { timeout: 30_000 });

  await studentPage.context().clearCookies();
  await studentPage.goto("/ingresar");
  await studentPage.fill("#email", student.email);
  await studentPage.fill("#password", student.password);
  await studentPage.getByRole("button", { name: "Ingresar" }).click();
  await expect(studentPage).toHaveURL(/\/app/, { timeout: 30_000 });
  await studentPage.goto("/admin/accesos");
  await expect(studentPage.getByText("Modo soporte: solo lectura.")).toBeVisible({ timeout: 60_000 });
  await studentPage.locator("tr", { hasText: student.email }).getByRole("button", { name: "Quitar" }).click();
  await expect(studentPage).toHaveURL(/aviso=solo-lectura/, { timeout: 30_000 });
  await page.reload();
  await page.goto("/admin/accesos");
  await expect(page.locator("tr", { hasText: student.email })).toBeVisible({ timeout: 60_000 });
});
