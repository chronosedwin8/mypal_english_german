import { expect, test } from "@playwright/test";

import { adminLogin, latestLink, signUp } from "./helpers";

/**
 * Institucion de punta a punta: MyPAL crea el colegio, su administrador acepta la
 * invitacion, compra licencias y crea un grupo; el docente comparte el codigo y un
 * estudiante se une con su fecha de nacimiento; el panel docente lo muestra.
 */
test("institución: alta, licencias, grupo, código y panel docente", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const { email } = await adminLogin(page);

  await page.goto("/admin/instituciones");
  await expect(page.getByRole("heading", { name: "Instituciones", exact: true, level: 1 })).toBeVisible({ timeout: 90_000 });
  await page.fill('input[name="name"]', "Colegio Demo E2E");
  await page.fill('input[name="adminEmail"]', email);
  await page.getByRole("button", { name: "Crear e invitar" }).click();
  await expect(page.getByText(/Colegio Demo E2E creada/)).toBeVisible({ timeout: 60_000 });

  // El administrador de la institucion acepta su invitacion
  await page.goto(latestLink(email, "/unirse/"));
  await page.getByRole("button", { name: /Unirme como/ }).click();
  await expect(page).toHaveURL(/\/institucion/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Colegio Demo E2E" })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: /Agregar licencias/ }).click();
  await expect(page.getByText(/licencias agregadas/)).toBeVisible({ timeout: 60_000 });
  await page.fill('input[name="name"][placeholder="Nombre del grupo"]', "11A IELTS");
  await page.fill('input[name="targetScore"]', "6.5");
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page.getByText("Grupo creado.")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "test-results/institucion.png", fullPage: true });

  // Panel docente: codigo del grupo
  await page.getByRole("link", { name: "11A IELTS" }).first().click();
  await expect(page).toHaveURL(/\/docente\/grupo\//, { timeout: 60_000 });
  const groupUrl = page.url();
  await page.getByRole("button", { name: "Código para estudiantes" }).click();
  const notice = await page.getByText(/Código para tus estudiantes: [A-Z0-9]{8}/).textContent({ timeout: 60_000 });
  const code = notice!.match(/: ([A-Z0-9]{8})/)![1];

  // Un estudiante se une con el codigo
  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await signUp(student, "alumno", `/unirse/${code}`);
  await expect(student.getByText(/te invita a MyPAL/)).toBeVisible({ timeout: 60_000 });
  await student.fill('input[name="birthDate"]', "2001-05-20");
  await student.getByRole("button", { name: /Unirme como/ }).click();
  await expect(student).toHaveURL(/\/app\/examenes/, { timeout: 60_000 });
  await studentCtx.close();

  await page.goto(groupUrl);
  await expect(page.getByText("Prueba E2E").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Activos en 7 días")).toBeVisible();
  await page.screenshot({ path: "test-results/docente-grupo.png", fullPage: true });
});

test("página para instituciones y solicitud de demo", async ({ page }) => {
  await page.goto("/instituciones");
  await expect(page.getByRole("heading", { level: 1, name: /Prepara a tus grupos/ })).toBeVisible({ timeout: 90_000 });
  await page.fill('input[name="institution"]', "Universidad de Prueba");
  await page.fill('input[name="students"]', "120");
  await page.fill('input[name="contactName"]', "Coordinación");
  await page.fill('input[name="email"]', `demo${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByText(/Recibimos tu solicitud/)).toBeVisible({ timeout: 60_000 });
});
