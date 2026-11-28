import { expect, test } from "@playwright/test";
import { addProduct, db, expectSaleRegistered, loginAdmin, loginPin, payExactCash, PIN, pickOption } from "./helpers";

// Lealtad por puntos (lib/loyalty-points.ts): puntos por negocio, nivel con
// cupón limitado a su negocio, ticket con los puntos y reversa al anular.
const BRANCH = "branch-principal";
const RUN = Date.now() % 1000000;
const PET_PRODUCT = `Pechera E2E ${RUN}`;
const TIER = `Nivel E2E ${RUN}`;

async function setLoyalty(data: {
  loyaltyMode: "SEPARADO" | "GLOBAL";
  loyaltyPointsPer100Cafe: number;
  loyaltyPointsPer100PetShop: number;
  loyaltyResetAtTopLevel: boolean;
}) {
  await db.branch.update({ where: { id: BRANCH }, data });
}

test.describe.serial("Lealtad por puntos", () => {
  let customerId: string;
  let customerName: string;
  let petVariantId: string;
  let firstSaleId: string;
  let couponCode: string;

  test.beforeAll(async () => {
    // 100 pts por $100 en Cafetería = 1 punto por peso; 10 en Pet Shop.
    await setLoyalty({
      loyaltyMode: "SEPARADO",
      loyaltyPointsPer100Cafe: 100,
      loyaltyPointsPer100PetShop: 10,
      loyaltyResetAtTopLevel: false,
    });
    await db.loyaltyTier.create({
      data: {
        program: "CAFE",
        name: TIER,
        pointsRequired: 10,
        rewardType: "CUPON_PORCENTAJE",
        rewardPercent: 10,
        rewardValidDays: 30,
      },
    });
    const category = await db.productCategory.create({ data: { name: `Accesorios E2E ${RUN}`, businessUnit: "PET_SHOP" } });
    const product = await db.product.create({
      data: {
        name: PET_PRODUCT,
        categoryId: category.id,
        type: "REVENTA_DIRECTA",
        branchProducts: { create: { branchId: BRANCH } },
        variants: { create: { name: "M", price: 300 } },
      },
      include: { variants: true },
    });
    petVariantId = product.variants[0].id;
    customerName = `Puntos E2E ${RUN}`;
    const customer = await db.customer.create({
      data: { name: customerName, phone: `55${String(RUN).padStart(8, "0")}`, loyaltyCard: { create: {} } },
    });
    customerId = customer.id;
  });

  test.afterAll(async () => {
    await db.loyaltyTier.deleteMany({ where: { name: TIER } });
    await db.product.updateMany({ where: { name: PET_PRODUCT }, data: { isActive: false } });
    await setLoyalty({
      loyaltyMode: "SEPARADO",
      loyaltyPointsPer100Cafe: 5,
      loyaltyPointsPer100PetShop: 1,
      loyaltyResetAtTopLevel: false,
    });
  });

  test("una compra mixta suma puntos a cada negocio y entrega el cupón del nivel", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await pickOption(page.locator("#customer"), customerName, new RegExp(`^${customerName}`));
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    // A un producto de reventa no se le ofrecen ingredientes.
    await page.getByLabel("Buscar en todo el menú").fill(PET_PRODUCT);
    await page.locator(".aspect-square:visible").filter({ hasText: PET_PRODUCT }).first().click();
    await expect(page.getByRole("dialog").getByText("Agregar otro ingrediente")).toBeHidden();
    await page.getByRole("dialog").getByRole("button", { name: "Agregar al carrito" }).click();
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: /^(Cobrar \$|Faltan \$|Calculando…|Cobrando…)/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Tus puntos");
    await expect(dialog).toContainText(`¡Subiste a ${TIER}!`);
    await expectSaleRegistered(page);

    const sale = await db.sale.findFirstOrThrow({ where: { customerId }, include: { items: true }, orderBy: { createdAt: "desc" } });
    firstSaleId = sale.id;
    const cafe = Math.floor(sale.total.toNumber() - 300); // sin descuento: lo que no es la pechera
    const balances = await db.loyaltyBalance.findMany({ where: { customerId } });
    expect(balances.find((b) => b.program === "CAFE")?.points).toBe(cafe);
    expect(balances.find((b) => b.program === "PET_SHOP")?.points).toBe(30);
    expect(balances.find((b) => b.program === "GLOBAL")?.points).toBe(cafe + 30);

    const grant = await db.loyaltyTierGrant.findFirstOrThrow({ where: { customerId, tier: { name: TIER } }, include: { discountCode: true } });
    expect(grant.discountCode?.businessUnit).toBe("CAFE");
    expect(grant.discountCode?.value.toNumber()).toBe(10);
    expect(grant.discountCode?.expiresAt).not.toBeNull();
    couponCode = grant.discountCode!.code;

    // Ticket impreso.
    await page.goto(`/pos/ticket/${sale.id}`);
    await expect(page.getByText("Tus puntos")).toBeVisible();
    await expect(page.getByText(`+${cafe} pts · saldo ${cafe}`)).toBeVisible();
    await expect(page.getByText(`+30 pts · saldo 30`)).toBeVisible();
    await expect(page.getByText(`Tu cupón: ${couponCode}`)).toBeVisible();

    // Tarjeta pública del cliente.
    const card = await db.loyaltyCard.findUniqueOrThrow({ where: { customerId } });
    await page.goto(`/lealtad/${card.code}`);
    await expect(page.getByText("10% en Cafetería")).toBeVisible();
    await expect(page.getByText(couponCode)).toBeVisible();
  });

  test("el cupón de Cafetería no aplica a Pet Shop y sí a las bebidas", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await pickOption(page.locator("#customer"), customerName, new RegExp(`^${customerName}`));
    await addProduct(page, PET_PRODUCT);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: /^Cupón o descuento/ }).click();
    await page.getByRole("button", { name: new RegExp(couponCode) }).click();
    await expect(page.getByText("Este cupón es solo para productos de Cafetería.")).toBeVisible();
    await page.getByRole("button", { name: "Exacto" }).click();
    await expect(page.getByRole("button", { name: /^(Cobrar \$|Faltan \$|Calculando…|Cobrando…)/ })).toBeDisabled();
    await page.getByRole("button", { name: "Atrás" }).click();

    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    // El cupón sigue elegido al volver a cobrar; se recalcula con la bebida.
    await page.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.getByText(/Válido — 10% en Cafetería, descuento de/)).toBeVisible();
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: /^(Cobrar \$|Faltan \$|Calculando…|Cobrando…)/ }).click();
    await expectSaleRegistered(page);

    const sale = await db.sale.findFirstOrThrow({ where: { customerId }, include: { items: true }, orderBy: { createdAt: "desc" } });
    const latte = sale.items.find((i) => i.productVariantId !== petVariantId)!;
    expect(sale.discountTotal.toNumber()).toBeCloseTo(latte.lineTotal.toNumber() * 0.1, 2);
    const code = await db.discountCode.findUniqueOrThrow({ where: { code: couponCode } });
    expect(code.usedAt).not.toBeNull();
  });

  test("anular la venta desde Ventas quita sus puntos", async ({ page }) => {
    const sale = await db.sale.findFirstOrThrow({ where: { customerId }, orderBy: { createdAt: "desc" } });
    const before = await db.loyaltyBalance.findUniqueOrThrow({ where: { customerId_program: { customerId, program: "CAFE" } } });
    const earned = await db.loyaltyPointsEntry.findFirstOrThrow({
      where: { saleId: sale.id, program: "CAFE", reason: "VENTA" },
    });

    await loginAdmin(page);
    await page.goto(`/ventas/${sale.id}`);
    await page.getByRole("button", { name: "Anular venta" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motivo").fill("Prueba e2e de puntos");
    await dialog.getByLabel("PIN de quien autoriza").fill(PIN.ana);
    await dialog.getByRole("button", { name: "Anular venta" }).click();
    await expect(dialog).toBeHidden();

    const after = await db.loyaltyBalance.findUniqueOrThrow({ where: { customerId_program: { customerId, program: "CAFE" } } });
    expect(after.points).toBe(before.points - earned.points);
    const entry = await db.loyaltyPointsEntry.findFirst({ where: { saleId: sale.id, program: "CAFE", reason: "CANCELACION" } });
    expect(entry?.points).toBe(-earned.points);
    // El cupón que usó esa venta vuelve a estar disponible.
    const code = await db.discountCode.findUniqueOrThrow({ where: { code: couponCode } });
    expect(code.usedAt).toBeNull();
  });

  test("anular la compra que ganó el nivel retira su cupón", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`/ventas/${firstSaleId}`);
    await page.getByRole("button", { name: "Anular venta" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motivo").fill("Prueba e2e de puntos");
    await dialog.getByLabel("PIN de quien autoriza").fill(PIN.ana);
    await dialog.getByRole("button", { name: "Anular venta" }).click();
    await expect(dialog).toBeHidden();

    const code = await db.discountCode.findUniqueOrThrow({ where: { code: couponCode } });
    expect(code.isActive).toBe(false);
    expect(await db.loyaltyTierGrant.count({ where: { customerId, tier: { name: TIER } } })).toBe(0);
    for (const b of await db.loyaltyBalance.findMany({ where: { customerId } })) expect(b.points).toBe(0);
  });

  test("puntos globales con reinicio: el excedente se conserva y el nivel se vuelve a ganar", async ({ page }) => {
    await setLoyalty({
      loyaltyMode: "GLOBAL",
      loyaltyPointsPer100Cafe: 100,
      loyaltyPointsPer100PetShop: 10,
      loyaltyResetAtTopLevel: true,
    });
    const tier = await db.loyaltyTier.create({
      data: { program: "GLOBAL", name: `${TIER} global`, pointsRequired: 20, rewardType: "NINGUNA" },
    });
    try {
      await loginPin(page, PIN.ana);
      await pickOption(page.locator("#customer"), customerName, new RegExp(`^${customerName}`));
      await addProduct(page, PET_PRODUCT); // $300 × 10/100 = 30 puntos
      await payExactCash(page);

      const balance = await db.loyaltyBalance.findUniqueOrThrow({ where: { customerId_program: { customerId, program: "GLOBAL" } } });
      expect(balance.cycle).toBe(1);
      expect(balance.points).toBe(10); // 30 − 20
      expect(await db.loyaltyTierGrant.count({ where: { customerId, tierId: tier.id } })).toBe(1);
    } finally {
      await db.loyaltyTier.delete({ where: { id: tier.id } });
    }
  });

  test("al pasar de una cuenta con cliente a otra sin cliente, la segunda no se le abona", async ({ page }) => {
    await setLoyalty({ loyaltyMode: "SEPARADO", loyaltyPointsPer100Cafe: 100, loyaltyPointsPer100PetShop: 10, loyaltyResetAtTopLevel: false });
    const withCustomer = `E2E-A${RUN % 1000}`;
    const without = `E2E-B${RUN % 1000}`;
    await loginPin(page, PIN.ana);
    await page.getByRole("button", { name: "Mesa", exact: true }).click();
    await pickOption(page.locator("#customer"), customerName, new RegExp(`^${customerName}`));
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.fill("#table-number", withCustomer);
    await page.getByRole("button", { name: "Dejar en espera" }).click();
    await expectSaleRegistered(page, "Pedido dejado en espera");

    await page.getByRole("button", { name: "Mesa", exact: true }).click();
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.fill("#table-number", without);
    await page.getByRole("button", { name: "Dejar en espera" }).click();
    await expectSaleRegistered(page, "Pedido dejado en espera");

    async function resume(table: string) {
      await page.getByRole("button", { name: /Cuentas en espera/ }).click();
      await page.getByRole("dialog").locator("li", { hasText: `Mesa ${table}` }).getByRole("button", { name: "Retomar" }).click();
    }
    await resume(withCustomer);
    await expect(page.getByText(`Seleccionado: ${customerName}`)).toBeVisible();
    await resume(without); // directo, sin "Salir"
    await expect(page.getByText(`Seleccionado: ${customerName}`)).toBeHidden();
    await payExactCash(page);

    const paid = await db.sale.findFirstOrThrow({ where: { tableNumber: without } });
    expect(paid.status).toBe("COMPLETADA");
    expect(paid.customerId).toBeNull();
    await db.sale.updateMany({ where: { tableNumber: withCustomer, status: "ABIERTA" }, data: { status: "CANCELADA" } });
  });
});
