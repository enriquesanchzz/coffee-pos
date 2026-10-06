import { expect, test } from "@playwright/test";
import { addProduct, db, loginAdmin, loginPin, PIN, payExactCash, stockOf } from "./helpers";

const MILK = { ingredientId: "ing-leche", stockLocationId: "stock-branch-principal" };

test.describe("QA-003 stock insuficiente", () => {
  test("advierte, exige confirmación y el panel muestra la alerta", async ({ page }) => {
    const original = await db.inventoryStock.findUniqueOrThrow({
      where: { ingredientId_stockLocationId: MILK },
    });
    await db.inventoryStock.update({ where: { ingredientId_stockLocationId: MILK }, data: { quantity: 0 } });
    try {
      await loginPin(page, PIN.ana);
      await addProduct(page, "Latte", ["Chico", "Caliente"]);
      await page.getByRole("button", { name: "Cobrar" }).click();
      await expect(page.getByText("Leche entera: faltan 180 ml")).toBeVisible();
      await page.getByRole("button", { name: "Exacto" }).click();
      await expect(page.getByRole("button", { name: "Confirmar venta" })).toBeDisabled();

      await page.getByLabel("Vender de todos modos").check();
      await page.getByRole("button", { name: "Confirmar venta" }).click();
      await expect(page.getByRole("status")).toContainText("Venta registrada");
      expect(await stockOf("ing-leche")).toBe(-180);

      await loginAdmin(page);
      await expect(page.getByText("sin stock o por debajo del mínimo")).toBeVisible();
    } finally {
      await db.inventoryStock.update({
        where: { ingredientId_stockLocationId: MILK },
        data: { quantity: original.quantity },
      });
    }
  });
});

test.describe("QA-004 carrito persistente", () => {
  test("el carrito sobrevive a una recarga y se descarta al cambiar de empleado", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    page.on("dialog", (d) => d.accept());
    await page.reload();
    await expect(page.getByText("Latte · Chico")).toBeVisible();

    await page.getByRole("button", { name: /Cambiar de empleado|Salir/ }).click();
    await loginPin(page, PIN.luis);
    await expect(page.getByText("Selecciona productos del catálogo")).toBeVisible();
  });
});

test.describe("QA-015 red", () => {
  test("si se pierde la respuesta del cobro, reintentar no duplica la venta", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "Exacto" }).click();

    const before = await db.sale.count();
    let dropped = false;
    await page.route("**/pos", async (route) => {
      const req = route.request();
      if (!dropped && req.method() === "POST" && (req.postData() ?? "").includes("clientRequestId")) {
        dropped = true;
        await route.fetch(); // el servidor SÍ registra la venta...
        await route.abort("failed"); // ...pero la respuesta nunca llega.
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await expect(page.getByText("Sin conexión con el servidor")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await expect(page.getByRole("status")).toContainText("Venta registrada");
    expect(await db.sale.count()).toBe(before + 1);
  });
});

test.describe("QA-011 sesión expirada", () => {
  test("una acción con la sesión vencida manda al login con mensaje", async ({ page, context }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "Exacto" }).click();
    await context.clearCookies();
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await page.waitForURL("**/?error=sesion");
    await expect(page.getByText("Tu sesión expiró")).toBeVisible();
  });
});

test("venta normal sigue funcionando sin advertencias", async ({ page }) => {
  await loginPin(page, PIN.luis);
  await addProduct(page, "Latte", ["Chico", "Caliente"]);
  await payExactCash(page);
});
