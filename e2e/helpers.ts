import { expect, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../playwright.config";

// Cliente de Prisma contra la base de prueba — para verificar efectos
// reales (inventario, ventas) además de lo que muestra la UI.
export const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });

export const PIN = { ana: "1234", luis: "5678" };

export async function loginPin(page: Page, pin: string) {
  // Con una sesión activa "/" redirige al POS sin pedir PIN: se sale antes.
  await page.context().clearCookies();
  await page.goto("/");
  await page.fill("#pin", pin);
  await page.click("button[type=submit]");
  await page.waitForURL("**/pos");
}

export async function loginAdmin(page: Page, email = "ana@nomada.cafe", password = "admin1234") {
  await page.goto("/administracion/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/administracion");
}

// Busca un producto en el POS, lo abre y lo agrega con las opciones dadas
// (nombres de botón exactos del diálogo, ej. ["Grande", "Frío"]).
export async function addProduct(page: Page, name: string, options: string[] = []) {
  const search = page.getByPlaceholder("Buscar en todo el menú…");
  await search.fill(name);
  await page.locator(".aspect-square:visible").filter({ hasText: name }).first().click();
  const dialog = page.getByRole("dialog");
  for (const option of options) {
    await dialog.getByRole("button", { name: option, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(dialog).toBeHidden();
  await search.fill("");
}

// Cobra la cuenta actual en efectivo con el monto exacto.
export async function payExactCash(page: Page) {
  await page.getByRole("button", { name: "Cobrar" }).click();
  await page.getByRole("button", { name: "Exacto" }).click();
  await page.getByRole("button", { name: "Confirmar venta" }).click();
  await expect(page.getByRole("status")).toContainText("Venta registrada");
}

export async function stockOf(ingredientId: string) {
  const rows = await db.inventoryStock.findMany({ where: { ingredientId } });
  return rows.reduce((sum, row) => sum + row.quantity.toNumber(), 0);
}

// Elige una opción de un <Combobox> (patrón ARIA combobox + listbox).
export async function pickOption(combobox: Locator, query: string, option: string | RegExp = query) {
  await combobox.click();
  await combobox.fill(query);
  await combobox.page().getByRole("option", { name: option }).first().click();
}
