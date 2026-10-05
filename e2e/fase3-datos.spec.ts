import { expect, test } from "@playwright/test";
import { addProduct, db, loginAdmin, loginPin, PIN, stockOf } from "./helpers";

test.describe("QA-007 promociones con horario nocturno", () => {
  test("un paquete de horario que cruza la medianoche se aplica", async ({ page }) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const minutes = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
    const hhmm = (m: number) => {
      const v = (m + 1440) % 1440;
      return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
    };
    const [latte, americano] = await Promise.all([
      db.productVariant.findFirstOrThrow({ where: { name: "Chico", temperature: "CALIENTE", product: { name: "Latte" } } }),
      db.productVariant.findFirstOrThrow({ where: { name: "Chico", temperature: "CALIENTE", product: { name: "Americano" } } }),
    ]);
    const name = `Nocturno E2E ${Date.now()}`;
    const combo = await db.combo.create({
      data: {
        name,
        price: 60,
        // Desde hace 1 h hasta "ayer" hace 2 h: cruza la medianoche y
        // contiene la hora actual.
        startTime: hhmm(minutes - 60),
        endTime: hhmm(minutes - 120),
        items: {
          create: [
            { productId: latte.productId, productVariantId: latte.id, quantity: 1 },
            { productId: americano.productId, productVariantId: americano.id, quantity: 1 },
          ],
        },
      },
    });
    try {
      await loginPin(page, PIN.ana);
      await addProduct(page, "Latte", ["Chico", "Caliente"]);
      await addProduct(page, "Americano", ["Chico", "Caliente"]);
      await page.getByRole("button", { name: "Cobrar" }).click();
      await expect(page.getByText(`Promoción: ${name}`)).toBeVisible();
    } finally {
      await db.combo.update({ where: { id: combo.id }, data: { isActive: false } });
    }
  });
});

test.describe("QA-008 códigos de descuento", () => {
  test("rechaza 200 % y normaliza el código; un cupón usado se ve como Usado", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/descuentos");
    await page.getByRole("button", { name: "+ Nuevo código" }).click();
    await page.fill("#discount-code", "PCT-E2E");
    await page.fill("#discount-value", "200");
    await page.getByRole("dialog").getByRole("button", { name: /Crear|Guardar/ }).click();
    await expect(page.getByText("no puede ser mayor a 100 %")).toBeVisible();

    const code = `e2e ${Date.now() % 100000}`;
    await page.fill("#discount-code", code);
    await page.fill("#discount-value", "10");
    await page.getByRole("dialog").getByRole("button", { name: /Crear|Guardar/ }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(code.toUpperCase().replace(/\s+/g, ""), { exact: true })).toBeVisible();

    const customer = await db.customer.create({ data: { name: `Cupón E2E ${Date.now()}` } });
    await db.discountCode.create({
      data: { code: `USADO-${Date.now() % 100000}`, type: "PORCENTAJE", value: 10, customerId: customer.id, usedAt: new Date() },
    });
    await page.reload();
    await page.locator("main select").first().selectOption("USADO");
    await expect(page.getByText(`Cupón de: ${customer.name}`)).toBeVisible();
  });
});

test.describe("QA-009/010 validación de datos", () => {
  test("proveedor con teléfono y email inválidos se rechaza", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/compras/proveedores/nuevo");
    const inputs = page.locator("main input:not([type=checkbox])");
    await inputs.nth(0).fill(`Proveedor E2E ${Date.now()}`);
    await inputs.nth(2).fill("abc");
    await page.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(page.getByText("El teléfono debe tener 10 dígitos")).toBeVisible();
    await inputs.nth(2).fill("341 123 4567");
    await inputs.nth(3).fill("no-email");
    await page.getByRole("button", { name: "Crear proveedor" }).click();
    await expect(page.getByText("El email no es válido.")).toBeVisible();
  });

  test("producto con imagen que no es https se rechaza", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/productos");
    await page.getByRole("button", { name: "+ Nuevo producto" }).click();
    await page.getByRole("button", { name: "Reventa directa (merch, souvenirs, tarjetas)" }).click();
    await page.fill("#product-name", `Producto E2E ${Date.now()}`);
    await page.fill("#product-image", "esto no es url");
    await page.selectOption("#product-category", { label: "Souvenirs" });
    await page.locator('input[placeholder="ej. Chico"]').first().fill("Único");
    await page.locator('input[id$="-price"]').first().fill("100");
    await page.getByRole("button", { name: "Crear producto" }).click();
    await expect(page.getByText("La imagen debe ser un link que empiece con https://")).toBeVisible();
  });

  test("el login de Administración no distingue mayúsculas en el email", async ({ page }) => {
    await loginAdmin(page, "ANA@Nomada.Cafe");
    await expect(page).toHaveURL(/\/administracion$/);
  });
});

test.describe("QA-012 domicilio", () => {
  test("no se cobra un pedido a domicilio sin dirección", async ({ page }) => {
    const customer = await db.customer.create({ data: { name: `Domicilio E2E ${Date.now()}`, phone: `33${Date.now() % 100000000}`.padEnd(10, "0").slice(0, 10) } });
    await loginPin(page, PIN.ana);
    await page.getByRole("button", { name: "A domicilio" }).click();
    await page.fill("#customer", customer.name);
    await page.getByRole("button", { name: new RegExp(`^${customer.name}`) }).first().click();
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await expect(page.getByText("Captura el domicilio de entrega")).toBeVisible();
  });
});

test.describe("D6 compras por presentación", () => {
  test("se pide en litros y se recibe al inventario en ml", async ({ page }) => {
    const supplier = await db.supplier.findFirstOrThrow({ where: { isActive: true } });
    const milkBefore = await stockOf("ing-leche");
    await loginAdmin(page);
    await page.goto("/compras/nueva");
    await page.locator("main select").first().selectOption(supplier.id);
    await page.locator("main select").nth(1).selectOption({ label: "Leche entera" });
    await expect(page.getByText("= 1000 ml")).toBeVisible();
    const numbers = page.locator("main input[type=number]");
    await numbers.nth(0).fill("2");
    await numbers.nth(1).fill("30");
    await page.getByRole("button", { name: "Crear orden" }).click();
    await page.waitForURL(/\/compras\/c/);
    await expect(page.getByText("pedido: 2 L")).toBeVisible();

    const item = await db.purchaseOrderItem.findFirstOrThrow({
      where: { purchaseOrderId: page.url().split("/").pop()! },
    });
    expect(item.orderedQuantity.toNumber()).toBe(2000);
    expect(item.estimatedUnitCost.toNumber()).toBeCloseTo(0.03);

    await page.getByRole("button", { name: "Registrar recepción" }).click();
    await expect(page.getByText("recibido 2 L")).toBeVisible();
    expect(await stockOf("ing-leche")).toBe(milkBefore + 2000);
  });
});

test.afterAll(async () => {
  // Datos de prueba de esta fase que no deben afectar a otras corridas.
  await db.discountCode.updateMany({ where: { code: { startsWith: "E2E" } }, data: { isActive: false } });
});
