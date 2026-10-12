import { expect, test } from "@playwright/test";
import { addProduct, db, loginPin, PIN } from "./helpers";

test.describe("Fase 4 UX", () => {
  test("la búsqueda del POS ignora acentos", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await page.getByLabel("Buscar en todo el menú").fill("clasico");
    await expect(page.locator(".aspect-square:visible").filter({ hasText: "Capuccino Clásico" }).first()).toBeVisible();
  });

  test("el cliente se elige solo con teclado", async ({ page }) => {
    const customer = await db.customer.create({ data: { name: `Teclado E2E ${Date.now()}` } });
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    const combobox = page.locator("#customer");
    await combobox.fill(customer.name);
    await expect(combobox).toHaveAttribute("aria-expanded", "true");
    await combobox.press("Enter");
    await expect(page.getByText(`Seleccionado: ${customer.name}`)).toBeVisible();
  });

  test("regresar del cobro no pierde lo capturado", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.fill("#cash-received", "100");
    await page.getByRole("button", { name: "← Atrás" }).click();
    await page.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.locator("#cash-received")).toHaveValue("100");
  });

  test("Administración pide password y su login permite volver al POS", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await page.goto("/administracion/login");
    await expect(page.getByText(/otro administrador/i)).toBeVisible();
    await page.getByRole("link", { name: "← Volver al Punto de Venta" }).click();
    await page.waitForURL("**/pos");
  });

  test("Clientes se puede buscar sin acentos", async ({ page }) => {
    const name = `Íñigo Búsqueda ${Date.now()}`;
    await db.customer.create({ data: { name } });
    await loginPin(page, PIN.ana);
    await page.goto("/clientes");
    await page.getByLabel("Buscar clientes").fill("inigo busqueda");
    await page.getByLabel("Buscar clientes").press("Enter");
    await expect(page.getByText(name)).toBeVisible();
  });
});
