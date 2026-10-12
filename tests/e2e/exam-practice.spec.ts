import { expect, test } from "@playwright/test";

import { signUp } from "./helpers";

/** Practica de examen: elegir IELTS, practicar un tipo de pregunta, entregar y ver el resultado. */

test("practica IELTS Reading por tipo: responder, entregar y revisar", async ({ page }) => {
  await signUp(page);

  await page.goto("/app/examenes");
  await expect(page.getByRole("heading", { name: "Exámenes", level: 1 })).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: "test-results/examenes-hub.png", fullPage: true });

  // True / False / Not Given de Reading
  const row = page.locator("li", { hasText: "True / False / Not Given" }).first();
  await row.getByRole("button", { name: "Practicar" }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/practica\//, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Resaltar" })).toBeVisible({ timeout: 60_000 });

  // Responder las dos primeras preguntas y resaltar una frase
  const groups = page.getByRole("radiogroup");
  await groups.nth(0).getByRole("radio", { name: "TRUE", exact: true }).click();
  await groups.nth(1).getByRole("radio", { name: "NOT GIVEN" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  await page.getByRole("button", { name: "Resaltar" }).click();
  await page.locator("article p span").first().click();
  await page.screenshot({ path: "test-results/examenes-reading.png", fullPage: false });

  // Entregar
  await page.getByRole("button", { name: "Entregar", exact: true }).click();
  await page.getByRole("button", { name: /Entregar ahora/ }).click();
  await expect(page).toHaveURL(/\/app\/examenes\/resultado\//, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Tu resultado" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Tu respuesta:/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/examenes-resultado.png", fullPage: true });

  // El panel muestra el dominio y la practica reciente
  await page.goto("/app/examenes");
  await expect(page.getByText("Tus prácticas recientes")).toBeVisible({ timeout: 60_000 });
});

test("practica IELTS Listening por parte: el reproductor da tiempo de lectura", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/examenes");
  await expect(page.getByRole("heading", { name: "Exámenes", level: 1 })).toBeVisible({ timeout: 90_000 });
  const part1 = page.getByRole("button", { name: "Part 1", exact: true });
  test.skip(!(await part1.isEnabled()), "Sin Listening Part 1 aprobado en el banco");
  await part1.click();
  await expect(page).toHaveURL(/\/app\/examenes\/practica\//, { timeout: 60_000 });
  await expect(page.getByRole("timer")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByText(/Lee las preguntas 1–/)).toBeVisible();
  await page.screenshot({ path: "test-results/examenes-listening.png", fullPage: false });
});
