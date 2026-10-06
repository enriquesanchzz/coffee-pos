import { expect, test } from "@playwright/test";
import { addProduct, db, loginPin, PIN, payExactCash, stockOf } from "./helpers";

// Flujo crítico de punta a punta: venta, inventario por receta, cuenta
// abierta de mesa y anulación.
test.describe("Punto de venta", () => {
  test("venta en efectivo descuenta inventario por receta y muestra el cambio", async ({ page }) => {
    await loginPin(page, PIN.ana);
    const milkBefore = await stockOf("ing-leche");

    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "+$100", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar venta" }).click();

    await expect(page.getByRole("status")).toContainText("Cambio a entregar: $57.00");
    expect(await stockOf("ing-leche")).toBe(milkBefore - 180);
  });

  test("cuenta abierta de mesa: no permite otra en la misma mesa y se cobra", async ({ page }) => {
    await loginPin(page, PIN.ana);
    const table = `E2E-${Date.now() % 10000}`;

    await page.getByRole("button", { name: "Mesa", exact: true }).click();
    await addProduct(page, "Latte");
    await page.fill("#table-number", table);
    await page.getByRole("button", { name: "Dejar cuenta abierta" }).click();
    await expect(page.locator("#table-number")).toHaveValue("");

    await page.getByRole("button", { name: "Mesa", exact: true }).click();
    await addProduct(page, "Latte");
    await page.fill("#table-number", table);
    await page.getByRole("button", { name: "Dejar cuenta abierta" }).click();
    await expect(page.getByText(`La mesa ${table} ya tiene una cuenta abierta`)).toBeVisible();
    await page.getByRole("button", { name: "Quitar" }).click();

    await page.getByRole("button", { name: "Cuentas abiertas" }).click();
    await page.getByRole("dialog").locator("li", { hasText: `Mesa ${table}` }).getByRole("button", { name: "Retomar" }).click();
    await payExactCash(page);

    const sale = await db.sale.findFirstOrThrow({ where: { tableNumber: table } });
    expect(sale.status).toBe("COMPLETADA");
  });

  test("anular una venta desde Caja regresa el inventario", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await payExactCash(page);
    const milkAfterSale = await stockOf("ing-leche");

    await page.goto("/caja");
    await page.getByRole("button", { name: "Anular", exact: true }).first().click();
    await page.fill("#cancel-reason", "prueba e2e");
    await page.fill("#cancel-pin", PIN.luis);
    await page.getByRole("button", { name: "Anular venta" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    expect(await stockOf("ing-leche")).toBe(milkAfterSale + 180);
  });
});
