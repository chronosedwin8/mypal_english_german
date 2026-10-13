import { expect, test } from "@playwright/test";

import { signUp } from "./helpers";

/** Banco aleman escrito por el equipo: practica por parte en Goethe B2 y TestDaF. */

test("Goethe B2 Hören Teil 1: diez preguntas alternadas, audio y resultado", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/examenes?examen=GOETHE_B2");
  await expect(page.getByRole("heading", { name: "Exámenes", level: 1 })).toBeVisible({ timeout: 90_000 });
  const hoeren = page.locator("div.rounded-3xl", { hasText: "Hören" }).filter({ has: page.getByRole("button", { name: "Teil 1" }) }).first();
  await hoeren.getByRole("button", { name: "Teil 1" }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/practica\//, { timeout: 60_000 });
  await expect(page.getByText("Text 1. Ist die Aussage richtig oder falsch?")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Text 5. Wählen Sie die richtige Lösung (A, B oder C).")).toBeVisible();
  await expect(page.getByRole("radio", { name: "RICHTIG" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/goethe-b2-hoeren-1.png", fullPage: true });

  await page.getByRole("button", { name: "Entregar", exact: true }).click();
  await page.getByRole("button", { name: /Entregar ahora/ }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/resultado\//, { timeout: 60_000 });
  await expect(page.getByText("La empresa paga el costo completo del curso.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Reportar pregunta" }).first()).toBeVisible();
});

test("TestDaF Lesen Aufgabe 2: texto con huecos y oraciones para insertar", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/examenes?examen=TESTDAF");
  await expect(page.getByRole("heading", { name: "Exámenes", level: 1 })).toBeVisible({ timeout: 90_000 });
  const lesen = page.locator("div.rounded-3xl", { hasText: "Lesen" }).filter({ has: page.getByRole("button", { name: "Aufgabe 2" }) }).first();
  await lesen.getByRole("button", { name: "Aufgabe 2" }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/practica\//, { timeout: 60_000 });
  await expect(page.getByText("So bekommen Sie ein Zimmer im Wohnheim")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Lücke 7").first()).toBeVisible();
  await page.screenshot({ path: "test-results/testdaf-lesen-2.png", fullPage: true });
});
