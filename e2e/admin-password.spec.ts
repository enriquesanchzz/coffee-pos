import { expect, test } from "@playwright/test";
import { loginPin, PIN } from "./helpers";

// Todo Administración pide email + password; el PIN ya no basta (nov 2026).
test.describe("Administración con password", () => {
  test("con solo PIN, un módulo de Administración manda al login y al entrar regresa a él", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await page.goto("/ventas");
    await page.waitForURL(/\/administracion\/login\?next=%2Fventas/);

    await page.fill("input[name=email]", "ana@nomada.cafe");
    await page.fill("input[name=password]", "admin1234");
    await page.click("button[type=submit]");
    await page.waitForURL("**/ventas");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ventas");
  });

  test("la exportación de ventas exige password", async ({ page }) => {
    await loginPin(page, PIN.ana);
    const res = await page.request.get("/ventas/exportar");
    expect(res.status()).toBe(403);
  });

  test("lealtad, recordatorios e inventario se movieron de Configuración", async ({ page }) => {
    await page.goto("/administracion/login");
    await page.fill("input[name=email]", "ana@nomada.cafe");
    await page.fill("input[name=password]", "admin1234");
    await page.click("button[type=submit]");
    await page.waitForURL("**/administracion");

    await page.goto("/configuracion/lealtad");
    await page.waitForURL("**/clientes/lealtad");
    await page.goto("/configuracion/inventario");
    await page.waitForURL("**/inventario/ajustes");
    await page.goto("/configuracion/recordatorios");
    await page.waitForURL(/\/clientes\/recordatorios/);
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();

    await page.goto("/configuracion");
    const nav = page.getByRole("navigation", { name: /Configuración/ });
    await expect(nav.getByRole("link", { name: "Lealtad" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Inventario" })).toHaveCount(0);
  });
});
