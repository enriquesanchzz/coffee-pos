import { randomBytes, scryptSync } from "crypto";
import { expect, test } from "@playwright/test";
import { addProduct, db, expectSaleRegistered, loginAdmin, loginPin, payExactCash, PIN, stockOf } from "./helpers";

// Regresiones de la auditoría de seguridad/procesos (noviembre 2026).

function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
}

test.describe.serial("Auditoría", () => {
  test("un pago negativo dentro de un pago dividido se rechaza", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    const salesBefore = await db.sale.count();

    // Se altera la petición del cobro como lo haría alguien desde las
    // herramientas del navegador: −$100 en efectivo + el resto con tarjeta.
    await page.route("**/pos", async (route) => {
      const request = route.request();
      const body = request.postData();
      if (request.method() !== "POST" || !body || !body.includes('"payments"')) return route.continue();
      const args = JSON.parse(body);
      const input = args[0];
      const total = input.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      input.payments = [
        { method: "EFECTIVO", amount: -100 },
        { method: "TARJETA", amount: total + 100 },
      ];
      await route.continue({ postData: JSON.stringify(args) });
    });

    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: /^(Cobrar \$|Faltan \$|Calculando…|Cobrando…)/ }).click();
    await expect(page.getByText("Cada pago debe ser un monto válido")).toBeVisible();
    expect(await db.sale.count()).toBe(salesBefore);
    await page.unroute("**/pos");
  });

  test("quitar un producto con más de 5 minutos en la cuenta pide el PIN de otra persona y queda registrado", async ({ page }) => {
    await loginPin(page, PIN.luis);
    const table = `AUD-${Date.now() % 100000}`;
    await page.getByRole("button", { name: "Mesa", exact: true }).click();
    await addProduct(page, "Latte");
    await addProduct(page, "Capuccino");
    await page.fill("#table-number", table);
    await page.getByRole("button", { name: "Dejar en espera" }).click();
    await expectSaleRegistered(page, "Pedido dejado en espera");

    const sale = await db.sale.findFirstOrThrow({ where: { tableNumber: table }, include: { items: { include: { productVariant: { include: { product: true } } } } } });
    const latte = sale.items.find((i) => i.productVariant?.product.name === "Latte")!;
    // Solo el Latte "lleva" 10 minutos en la cuenta.
    await db.saleItem.update({ where: { id: latte.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });

    await page.getByRole("button", { name: /Cuentas en espera/ }).click();
    await page.getByRole("dialog").locator("li", { hasText: `Mesa ${table}` }).getByRole("button", { name: "Retomar" }).click();

    // Capuccino recién agregado: se corrige sin PIN.
    await page.locator("li", { hasText: "Capuccino" }).getByRole("button", { name: /de la cuenta$/ }).click();
    await expect(page.locator("li", { hasText: "Capuccino" })).toHaveCount(0);

    // Latte con 10 minutos: pide autorización; su propio PIN no basta.
    await page.locator("li", { hasText: "Latte" }).getByRole("button", { name: /de la cuenta$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Autorizar corrección" });
    await expect(dialog).toBeVisible();
    await dialog.locator("#tab-correction-pin").fill(PIN.luis);
    await dialog.getByRole("button", { name: "Autorizar" }).click();
    await expect(dialog.getByText("La autorización debe ser de otra persona.")).toBeVisible();
    await dialog.locator("#tab-correction-pin").fill(PIN.ana);
    await dialog.getByRole("button", { name: "Autorizar" }).click();
    await expect(dialog).toBeHidden();

    const voids = await db.saleItemVoid.findMany({ where: { saleId: sale.id }, orderBy: { createdAt: "asc" } });
    expect(voids).toHaveLength(2);
    expect(voids[0].authorizedById).toBeNull();
    expect(voids[1].description).toContain("Latte");
    expect(voids[1].authorizedById).toBe("emp-ana");

    // Se ve en el detalle de la venta (Administración por PIN de Ana).
    await loginPin(page, PIN.ana);
    await page.goto(`/ventas/${sale.id}`);
    await expect(page.getByText("Quitado de la cuenta antes de cobrar")).toBeVisible();
    await expect(page.getByText("autorizó Ana")).toBeVisible();

    await db.sale.update({ where: { id: sale.id }, data: { status: "CANCELADA", cancelReason: "e2e" } });
  });

  test("el corte de caja es ciego: el esperado aparece solo después de registrar el conteo", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await page.goto("/caja");
    await page.getByRole("button", { name: "Cerrar turno" }).click();
    const dialog = page.getByRole("dialog", { name: "Cerrar turno" });
    await expect(dialog.locator("#closingCash")).toBeVisible();
    await expect(dialog.getByText("Efectivo esperado", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Registrar conteo" })).toBeDisabled();

    await dialog.locator("#closingCash").fill("123.45");
    await dialog.getByRole("button", { name: "Registrar conteo" }).click();
    await expect(dialog.getByText("Efectivo esperado", { exact: true })).toBeVisible();
    await expect(dialog.locator("#closingCash")).toHaveCount(0);
    await expect(dialog.getByText("$123.45")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("aprobar un conteo físico respeta las ventas hechas después de contar", async ({ page }) => {
    const ingredientId = "ing-leche";
    const counted = (await stockOf(ingredientId)) - 50;
    const count = await db.physicalCount.create({
      data: {
        branchId: "branch-principal",
        performedById: "emp-luis",
        status: "PENDIENTE_APROBACION",
        lines: {
          create: { ingredientId, theoreticalQty: counted + 50, physicalQty: counted, unit: "ML" },
        },
      },
    });

    // Venta entre el conteo y la aprobación: consume 180 ml de leche.
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await payExactCash(page);
    const afterSale = await stockOf(ingredientId);

    await page.goto(`/compras/conteos/${count.id}`);
    await page.fill("#confirmingPin", PIN.ana);
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect.poll(async () => (await db.physicalCount.findUniqueOrThrow({ where: { id: count.id } })).status).toBe("APROBADO");

    // Antes quedaba en `counted` (la venta de después se "regresaba").
    expect(await stockOf(ingredientId)).toBe(afterSale - 50);
  });

  test("un empleado desactivado ya no puede operar con la sesión que tenía abierta", async ({ page }) => {
    await loginPin(page, PIN.luis);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await db.employee.update({ where: { id: "emp-luis" }, data: { isActive: false } });
    try {
      await page.getByRole("button", { name: "Cobrar" }).click();
      await page.getByRole("button", { name: "Exacto" }).click();
      await page.getByRole("button", { name: /^(Cobrar \$|Faltan \$|Calculando…|Cobrando…)/ }).click();
      await page.waitForURL(/\/\?error=sesion/);
    } finally {
      await db.employee.update({ where: { id: "emp-luis" }, data: { isActive: true } });
    }
  });

  test("reactivar a un empleado exige asignarle un PIN nuevo", async ({ page }) => {
    const role = await db.role.findUniqueOrThrow({ where: { name: "BARISTA" } });
    const employee = await db.employee.create({
      data: {
        name: `Inactivo E2E ${Date.now() % 100000}`,
        pin: hashPin("9137"),
        isActive: false,
        branches: { create: { branchId: "branch-principal", roleId: role.id } },
      },
    });

    await loginAdmin(page);
    await page.goto(`/empleados/${employee.id}`);
    await page.getByLabel("Activo").check();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Para reactivar a este empleado, asígnale un PIN nuevo")).toBeVisible();
    expect((await db.employee.findUniqueOrThrow({ where: { id: employee.id } })).isActive).toBe(false);

    await db.employeeBranch.deleteMany({ where: { employeeId: employee.id } });
    await db.employee.delete({ where: { id: employee.id } });
  });
});
