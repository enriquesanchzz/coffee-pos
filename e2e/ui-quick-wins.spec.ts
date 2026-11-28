import { expect, test } from "@playwright/test";
import { addProduct, db, expectSaleRegistered, loginPin, PIN } from "./helpers";

// Quick wins de la auditoría UI/UX del flujo de venta (noviembre 2026).
test.describe("Quick wins UI/UX", () => {
  test("el botón final dice cuánto falta y luego cuánto y cómo se cobra", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await expect(page.getByText("Descuentos y propina, al cobrar")).toBeVisible();
    await page.getByRole("button", { name: "Cobrar", exact: true }).click();

    // Sin efectivo capturado el botón explica lo que falta.
    await expect(page.getByRole("button", { name: /^Faltan \$/ })).toBeDisabled();
    await page.fill("#cash-received", "1");
    await expect(page.getByRole("button", { name: /^Faltan \$/ })).toBeDisabled();

    await page.getByRole("button", { name: "Exacto" }).click();
    const confirm = page.getByRole("button", { name: /^Cobrar \$[\d,.]+ en efectivo$/ });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expectSaleRegistered(page);
  });

  test("imprimir una cuenta con ronda pendiente la agrega primero y abre la pre-cuenta", async ({ page, context }) => {
    await loginPin(page, PIN.ana);
    const table = `QW-${Date.now() % 100000}`;
    await page.getByRole("button", { name: "Mesa", exact: true }).click();
    await addProduct(page, "Latte");
    await page.fill("#table-number", table);
    await page.getByRole("button", { name: "Dejar en espera" }).click();
    await expectSaleRegistered(page, "Pedido dejado en espera");

    await page.getByRole("button", { name: /Cuentas en espera/ }).click();
    await page.getByRole("dialog").locator("li", { hasText: `Mesa ${table}` }).getByRole("button", { name: "Retomar" }).click();
    await addProduct(page, "Capuccino");

    await page.getByRole("link", { name: "Imprimir cuenta" }).click();
    const dialog = page.getByRole("dialog", { name: "Imprimir cuenta" });
    await expect(dialog).toContainText("¿Agregar este producto a la cuenta y luego imprimir?");
    const popupPromise = context.waitForEvent("page");
    await dialog.getByRole("button", { name: "Agregar e imprimir" }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/\/pos\/cuenta\//);

    const sale = await db.sale.findFirstOrThrow({ where: { tableNumber: table }, include: { items: true } });
    expect(sale.items).toHaveLength(2);
    await db.sale.update({ where: { id: sale.id }, data: { status: "CANCELADA", cancelReason: "e2e" } });
  });

  test("panel de cobro por zonas: venta en efectivo en 2 toques y sin scroll en tablet", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar", exact: true }).click();

    // Total (zona A) y botón (zona G) a la vista sin desplazar nada.
    const total = page.getByRole("button", { name: /^Total a cobrar/ });
    await expect(total).toBeInViewport();
    await expect(page.getByRole("button", { name: /^(Cobrar \$|Faltan \$)/ })).toBeInViewport();
    // Descuento plegado; el desglose se abre al tocar el Total.
    await expect(page.getByRole("button", { name: "Manual" })).toHaveCount(0);
    await total.click();
    await expect(page.locator("#checkout-breakdown")).toContainText("Subtotal");

    // Toque 1: Exacto. Toque 2: Cobrar.
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: /^Cobrar \$[\d,.]+ en efectivo$/ }).click();
    await expectSaleRegistered(page);
  });

  test("tipo de orden, mesa y cliente van arriba del catálogo en tablet y dentro de la cuenta en celular", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await loginPin(page, PIN.ana);
    const cuenta = page.locator("section#cuenta");
    await expect(page.locator("#table-number")).toBeVisible();
    await expect(cuenta.locator("#table-number")).toHaveCount(0);
    await expect(cuenta.locator("#customer")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: /Ver cuenta/ }).click();
    await expect(cuenta.locator("#table-number")).toBeVisible();
    await expect(page.locator("#table-number")).toHaveCount(1);
  });
});

