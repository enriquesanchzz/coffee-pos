import { expect, test, type Page } from "@playwright/test";
import { addProduct, db, loginAdmin, loginPin, PIN } from "./helpers";

// Configuración → cada sección cambia de verdad el comportamiento del
// sistema. Los ajustes se guardan desde la UI y se restauran al final
// (columnas de Branch a sus valores por defecto) para no afectar a las
// demás pruebas.
const BRANCH = "branch-principal";
const MILK = { ingredientId: "ing-leche", stockLocationId: "stock-branch-principal" };

async function resetSettings() {
  await db.branch.update({
    where: { id: BRANCH },
    data: {
      businessName: null,
      phone: null,
      timeZone: null,
      tipPercents: [10, 15, 20],
      highTipThresholdPercent: 50,
      paymentMethods: ["EFECTIVO", "TARJETA", "TRANSFERENCIA"],
      cashQuickBills: [20, 50, 100, 200, 500, 1000],
      shiftChangeHour: 14,
      defaultOpeningCash: 0,
      cashDifferenceTolerance: 0,
      loyaltyStampsPerReward: 5,
      welcomeCouponPercent: 10,
      welcomeCouponValidDays: null,
      maxManualDiscountPercent: null,
      shortagePolicy: "CONFIRMAR",
      pinMaxAttempts: 5,
      pinLockMinutes: 5,
      sessionHours: 12,
      taxMode: "NINGUNO",
      taxRatePercent: 16,
    },
  });
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
}

test.describe.serial("Configuración del sistema", () => {
  test.beforeAll(resetSettings);
  test.afterAll(resetSettings);

  test("Negocio: el nombre aparece en el inicio de sesión y en el título", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion");
    await page.getByLabel("Nombre del negocio").fill("Café Prueba E2E");
    await page.getByLabel("Teléfono (opcional)").fill("33 1234 5678");
    await save(page);
    await expect(page).toHaveTitle(/Café Prueba E2E/);

    await page.goto("/configuracion");
    await page.getByLabel("Teléfono (opcional)").fill("123");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("El teléfono debe tener 10 dígitos")).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Café Prueba E2E — Entrar" })).toBeVisible();
  });

  test("Cobro: propinas, métodos de pago y billetes del POS", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion/cobro");
    await page.getByLabel("Propinas sugeridas (%)").fill("5, 12");
    await page.getByLabel("Transferencia").uncheck();
    await page.getByLabel("Botones de billetes en efectivo ($)").fill("50, 500");
    await save(page);

    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.getByRole("button", { name: "5%", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "12%", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "15%", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Transferencia" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+$500", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+$20", exact: true })).toHaveCount(0);
  });

  test("Descuentos: el tope del descuento manual se respeta en el cobro", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion/descuentos");
    await page.getByLabel("Limitar el descuento manual").check();
    await page.getByLabel("Máximo (% del subtotal)").fill("10");
    await save(page);

    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "Manual" }).click();
    await page.fill("#manualValue", "50");
    await expect(page.getByText("El descuento manual no puede pasar del 10% del subtotal.")).toBeVisible();
  });

  test("Impuestos: el cobro desglosa el IVA y la venta lo guarda", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion/impuestos");
    await page.getByLabel("Precios con IVA incluido (se desglosa en el cobro)").check();
    await page.getByLabel("Tasa de IVA (%)").fill("16");
    await save(page);

    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.getByText("Incluye IVA (16%)")).toBeVisible();
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await expect(page.getByRole("status")).toContainText("Incluye IVA $5.93");
    const sale = await db.sale.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(sale.taxAmount.toNumber()).toBeCloseTo(5.93);
  });

  test("Inventario: con política de bloqueo no se puede vender sin insumos", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion/inventario");
    await page.getByLabel("No se permite vender sin insumos").check();
    await save(page);

    const original = await db.inventoryStock.findUniqueOrThrow({ where: { ingredientId_stockLocationId: MILK } });
    await db.inventoryStock.update({ where: { ingredientId_stockLocationId: MILK }, data: { quantity: 0 } });
    try {
      await loginPin(page, PIN.ana);
      await addProduct(page, "Latte", ["Chico", "Caliente"]);
      await page.getByRole("button", { name: "Cobrar" }).click();
      await expect(page.getByText("No se permite vender sin insumos suficientes.")).toBeVisible();
      await expect(page.getByLabel("Vender de todos modos")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Confirmar venta" })).toBeDisabled();
    } finally {
      await db.inventoryStock.update({
        where: { ingredientId_stockLocationId: MILK },
        data: { quantity: original.quantity },
      });
    }
  });

  test("Inventario: el mínimo de stock marca el insumo como stock bajo", async ({ page }) => {
    const stock = await db.inventoryStock.findUniqueOrThrow({ where: { ingredientId_stockLocationId: MILK } });
    await loginAdmin(page);
    await page.goto("/configuracion/inventario");
    await page.getByLabel("Buscar insumo").fill("Leche entera");
    await page.getByLabel(/^Mínimo de Leche entera/).fill(String(stock.quantity.toNumber() + 1));
    await page.getByRole("button", { name: /Guardar mínimos/ }).click();
    await expect(page.getByText("Se guardaron 1 mínimo.")).toBeVisible();
    const point = await db.reorderPoint.findUniqueOrThrow({ where: { ingredientId_stockLocationId: MILK } });
    expect(point.manualThreshold.toNumber()).toBe(stock.quantity.toNumber() + 1);
    await db.reorderPoint.delete({ where: { ingredientId_stockLocationId: MILK } });
  });

  test("Lealtad: sellos por recompensa, cupón y niveles", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion/lealtad");
    await page.getByLabel("Sellos por recompensa").fill("3");
    await page.getByLabel("Cupón de bienvenida (%)").fill("0");
    await save(page);

    const tierName = `Oro E2E ${Date.now() % 100000}`;
    await page.getByRole("button", { name: "+ Agregar nivel" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(tierName);
    await page.getByLabel("Desde cuántas compras").fill("50");
    await page.getByLabel("Beneficio (opcional)").fill("Café gratis cada mes");
    await page.getByRole("button", { name: "Guardar nivel" }).click();
    await expect(page.getByText(tierName)).toBeVisible();

    // Cliente nuevo: sin cupón de bienvenida (0%).
    await page.goto("/clientes/nuevo");
    const name = `Sin cupón E2E ${Date.now()}`;
    await page.fill("#name", name);
    await page.getByRole("button", { name: /Crear|Guardar/ }).click();
    await expect(page.getByText(`${name} ya tiene su tarjeta de lealtad.`)).toBeVisible();
    const customer = await db.customer.findFirstOrThrow({
      where: { name },
      include: { loyaltyCard: true, discountCodes: true },
    });
    expect(customer.discountCodes).toHaveLength(0);

    await page.goto(`/lealtad/${customer.loyaltyCard!.code}`);
    await expect(page.getByText("0 de 3 sellos")).toBeVisible();
    await db.loyaltyTier.deleteMany({ where: { name: tierName } });
  });

  test("Caja y Seguridad: fondo sugerido, tolerancia y minutos de bloqueo", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion/caja");
    await page.getByLabel("Fondo de caja sugerido ($)").fill("750");
    await save(page);

    await page.goto("/configuracion/seguridad");
    await page.getByLabel("Minutos de bloqueo").fill("7");
    await save(page);
    await page.getByLabel("Intentos fallidos antes de bloquear").fill("1");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Los intentos de PIN debe ser un número entero entre 3 y 20.")).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/?error=bloqueado");
    await expect(page.getByText("Espera 7 minutos antes de volver a intentar.")).toBeVisible();

    // El formulario de apertura toma el fondo sugerido (sin turno abierto).
    await db.shift.updateMany({ where: { status: "ABIERTO" }, data: { status: "CERRADO", closedAt: new Date() } });
    await loginPin(page, PIN.ana);
    await expect(page.locator("#openingCash")).toHaveValue("750");
    await page.fill("#confirmingPin", PIN.luis);
    await page.getByRole("button", { name: "Abrir turno" }).click();
    await expect(page.getByPlaceholder("Buscar en todo el menú…")).toBeVisible();
  });

  test("Restaurar valores originales de una sección", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion/cobro");
    await page.getByRole("button", { name: "Restaurar valores originales" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByText("Se restauraron los valores originales.")).toBeVisible();
    await expect(page.getByLabel("Propinas sugeridas (%)")).toHaveValue("10, 15, 20");
    await expect(page.getByLabel("Transferencia")).toBeChecked();
  });
});
