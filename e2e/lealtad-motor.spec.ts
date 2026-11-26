import { expect, test } from "@playwright/test";
import type { LoyaltyProgram, Prisma } from "@prisma/client";
import { db } from "./helpers";
import { netByUnit } from "../lib/business-unit";
import {
  awardSalePoints,
  revertSalePoints,
  syncAllPermanentDiscounts,
  withdrawReleasedCouponIfUnearned,
} from "../lib/loyalty-points";

// Reglas del motor de puntos que la UI no alcanza a cubrir: reinicios que
// se deshacen, cupones que no se pueden "cultivar" anulando, descuentos
// permanentes derivados del nivel, cambios de configuración y cobros
// simultáneos. Corre directo contra la base de prueba.
const BRANCH = "branch-principal";
const RUN = `${Date.now() % 10_000_000}`;

type Config = { mode?: "SEPARADO" | "GLOBAL"; reset?: boolean };
async function configure({ mode = "SEPARADO", reset = false }: Config = {}) {
  await db.branch.update({
    where: { id: BRANCH },
    data: {
      loyaltyMode: mode,
      loyaltyResetAtTopLevel: reset,
      loyaltyPointsPer100Cafe: 100, // 1 punto por peso
      loyaltyPointsPer100PetShop: 10,
    },
  });
}

test.describe.serial("Motor de puntos", () => {
  let shiftId: string;
  let employeeId: string;
  let cafeVariant: string;
  let petVariant: string;
  let seededTiers: Prisma.LoyaltyTierCreateManyInput[] = [];
  let n = 0;

  test.beforeAll(async () => {
    const shift = await db.shift.findFirstOrThrow({ orderBy: { openedAt: "desc" } });
    shiftId = shift.id;
    employeeId = shift.cashierId;
    const make = async (unit: "CAFE" | "PET_SHOP") => {
      const category = await db.productCategory.create({ data: { name: `Motor ${unit} ${RUN}`, businessUnit: unit } });
      const product = await db.product.create({
        data: { name: `Motor ${unit} ${RUN}`, categoryId: category.id, type: "REVENTA_DIRECTA", variants: { create: { name: "U", price: 100 } } },
        include: { variants: true },
      });
      return product.variants[0].id;
    };
    cafeVariant = await make("CAFE");
    petVariant = await make("PET_SHOP");
    // Niveles propios por prueba: los del seed se guardan y se regresan.
    seededTiers = await db.loyaltyTier.findMany();
  });

  test.beforeEach(async () => {
    await db.loyaltyTier.deleteMany({});
    await configure();
  });

  test.afterAll(async () => {
    // Activos solo durante la prueba (sin sucursal, así que el POS no los ve).
    await db.product.updateMany({ where: { name: { startsWith: `Motor ` }, categoryId: { not: undefined } }, data: { isActive: false } });
    await db.loyaltyTier.deleteMany({});
    await db.loyaltyTier.createMany({ data: seededTiers });
    await db.branch.update({
      where: { id: BRANCH },
      data: { loyaltyMode: "SEPARADO", loyaltyResetAtTopLevel: false, loyaltyPointsPer100Cafe: 5, loyaltyPointsPer100PetShop: 1 },
    });
  });

  async function customer() {
    n += 1;
    return (await db.customer.create({ data: { name: `Motor ${RUN}-${n}` } })).id;
  }
  function tier(program: LoyaltyProgram, pointsRequired: number, data: Partial<Prisma.LoyaltyTierUncheckedCreateInput> = {}) {
    return db.loyaltyTier.create({ data: { program, name: `T${program}${pointsRequired}`, pointsRequired, ...data } });
  }
  // Venta cobrada con sus líneas; devuelve el id.
  async function sale(customerId: string, cafe: number, pet = 0, extra: { discount?: number; codeId?: string } = {}) {
    const items = [
      ...(cafe > 0 ? [{ productVariantId: cafeVariant, quantity: 1, unitPrice: cafe, lineTotal: cafe }] : []),
      ...(pet > 0 ? [{ productVariantId: petVariant, quantity: 1, unitPrice: pet, lineTotal: pet }] : []),
    ];
    const created = await db.sale.create({
      data: {
        branchId: BRANCH,
        shiftId,
        employeeId,
        customerId,
        subtotal: cafe + pet,
        discountTotal: extra.discount ?? 0,
        total: cafe + pet - (extra.discount ?? 0),
        discountCodeId: extra.codeId,
        items: { create: items },
      },
    });
    return created.id;
  }
  async function buy(customerId: string, cafe: number, pet = 0) {
    const id = await sale(customerId, cafe, pet);
    await db.$transaction((tx) => awardSalePoints(tx, id, customerId));
    return id;
  }
  async function cancel(saleId: string, customerId: string, usedCodeId?: string) {
    await db.$transaction(async (tx) => {
      await tx.sale.update({ where: { id: saleId }, data: { status: "CANCELADA" } });
      if (usedCodeId) await tx.discountCode.update({ where: { id: usedCodeId }, data: { usedAt: null } });
      await revertSalePoints(tx, saleId, customerId);
      if (usedCodeId) await withdrawReleasedCouponIfUnearned(tx, usedCodeId);
    });
  }
  async function position(customerId: string, program: LoyaltyProgram = "CAFE") {
    const b = await db.loyaltyBalance.findUniqueOrThrow({ where: { customerId_program: { customerId, program } } });
    return { points: b.points, cycle: b.cycle };
  }
  async function liveCoupons(customerId: string) {
    return db.discountCode.findMany({ where: { customerId, isActive: true, usedAt: null }, orderBy: { id: "asc" } });
  }
  // La bitácora siempre suma el saldo.
  async function expectLedger(customerId: string) {
    for (const b of await db.loyaltyBalance.findMany({ where: { customerId } })) {
      const sum = await db.loyaltyPointsEntry.aggregate({ where: { customerId, program: b.program }, _sum: { points: true } });
      expect(sum._sum.points ?? 0).toBe(b.points);
      expect(b.points).toBeGreaterThanOrEqual(0);
      expect(b.lifetimePoints).toBeGreaterThanOrEqual(0);
    }
  }
  test.afterEach(async () => {
    for (const c of await db.customer.findMany({ where: { name: { startsWith: `Motor ${RUN}-` } }, select: { id: true } })) await expectLedger(c.id);
  });

  test("el ejemplo del negocio: $200 café + $300 pet = 10 y 3 puntos", async () => {
    await db.branch.update({ where: { id: BRANCH }, data: { loyaltyPointsPer100Cafe: 5, loyaltyPointsPer100PetShop: 1 } });
    const c = await customer();
    await buy(c, 200, 300);
    expect((await position(c, "CAFE")).points).toBe(10);
    expect((await position(c, "PET_SHOP")).points).toBe(3);
    expect((await position(c, "GLOBAL")).points).toBe(13);
    expect(await db.loyaltyCard.count({ where: { customerId: c } })).toBe(1);
  });

  test("el descuento de un cupón solo resta en su negocio", () => {
    const lines = [
      { unit: "CAFE" as const, amount: 100, productVariantId: "latte", discountable: true },
      { unit: "PET_SHOP" as const, amount: 300, productVariantId: "costal", discountable: true },
    ];
    expect(netByUnit(lines, 300, { businessUnit: null, productVariantId: "latte" })).toEqual({ CAFE: 0, PET_SHOP: 300 });
    expect(netByUnit(lines, 350, { businessUnit: "CAFE", productVariantId: null })).toEqual({ CAFE: 50, PET_SHOP: 300 });
    expect(netByUnit(lines, 360, null)).toEqual({ CAFE: 90, PET_SHOP: 270 });
    expect(netByUnit(lines, 400, null)).toEqual({ CAFE: 100, PET_SHOP: 300 });
  });

  test("dar puntos dos veces por la misma venta no duplica", async () => {
    const c = await customer();
    const s = await buy(c, 50);
    await db.$transaction((tx) => awardSalePoints(tx, s, c));
    expect((await position(c)).points).toBe(50);
  });

  test("anular la venta que reinició deshace el reinicio", async () => {
    await configure({ reset: true });
    await tier("CAFE", 100, { rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 });
    const c = await customer();
    await buy(c, 95);
    const s = await buy(c, 10);
    expect(await position(c)).toEqual({ points: 5, cycle: 1 });
    expect(await liveCoupons(c)).toHaveLength(1);
    await cancel(s, c);
    expect(await position(c)).toEqual({ points: 95, cycle: 0 });
    expect(await liveCoupons(c)).toHaveLength(0);
    // Y lo puede volver a ganar.
    await buy(c, 10);
    expect(await position(c)).toEqual({ points: 5, cycle: 1 });
    expect(await liveCoupons(c)).toHaveLength(1);
  });

  test("comprar, canjear y anular no fabrica otro premio", async () => {
    await configure({ reset: true });
    await tier("CAFE", 100, { rewardType: "PRODUCTO_GRATIS", rewardVariantId: cafeVariant });
    const c = await customer();
    const a = await buy(c, 100);
    const [coupon] = await liveCoupons(c);
    await db.discountCode.update({ where: { id: coupon.id }, data: { usedAt: new Date() } });
    await cancel(a, c);
    expect(await position(c)).toEqual({ points: 0, cycle: 0 });
    await buy(c, 100);
    expect(await liveCoupons(c)).toHaveLength(0);
  });

  test("anular la compra que ganó el cupón y luego la que lo usó no lo deja vivo", async () => {
    await tier("CAFE", 100, { rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 });
    const c = await customer();
    const a = await buy(c, 100);
    const [coupon] = await liveCoupons(c);
    await db.discountCode.update({ where: { id: coupon.id }, data: { usedAt: new Date() } });
    const b = await sale(c, 50, 0, { discount: 5, codeId: coupon.id });
    await db.$transaction((tx) => awardSalePoints(tx, b, c));
    await cancel(a, c);
    await cancel(b, c, coupon.id);
    expect(await liveCoupons(c)).toHaveLength(0);
  });

  test("anular una compra no quita un nivel que se sigue alcanzando", async () => {
    await tier("CAFE", 100, { rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 });
    const c = await customer();
    const a = await buy(c, 100);
    await buy(c, 100);
    await cancel(a, c);
    expect(await position(c)).toEqual({ points: 100, cycle: 0 });
    expect(await liveCoupons(c)).toHaveLength(1);
  });

  test("activar el reinicio con saldo viejo no reparte premios atrasados", async () => {
    await tier("CAFE", 100, { rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 });
    const c = await customer();
    await buy(c, 1500);
    expect(await liveCoupons(c)).toHaveLength(1);
    await configure({ reset: true });
    await buy(c, 10);
    expect(await position(c)).toEqual({ points: 10, cycle: 1 });
    expect(await liveCoupons(c)).toHaveLength(1);
  });

  test("una recompensa nueva no se regala por puntos que ya se tenían", async () => {
    const c = await customer();
    await buy(c, 500);
    await tier("CAFE", 100, { rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 });
    await buy(c, 10);
    expect(await liveCoupons(c)).toHaveLength(0);
  });

  test("el descuento permanente sigue al nivel: sube, cambia, baja y se apaga", async () => {
    const low = await tier("CAFE", 50, { rewardType: "DESCUENTO_PERMANENTE", rewardPercent: 5 });
    const high = await tier("CAFE", 100, { rewardType: "DESCUENTO_PERMANENTE", rewardPercent: 10 });
    const c = await customer();
    const permanent = () => db.discountCode.findFirst({ where: { customerId: c, loyaltyProgram: "CAFE" } });
    await buy(c, 60);
    expect((await permanent())?.value.toNumber()).toBe(5);
    const b = await buy(c, 50);
    expect((await permanent())?.value.toNumber()).toBe(10);
    expect(await liveCoupons(c)).toHaveLength(1); // uno solo, no se acumulan

    await db.loyaltyTier.update({ where: { id: high.id }, data: { rewardPercent: 12 } });
    await db.$transaction((tx) => syncAllPermanentDiscounts(tx), { timeout: 30_000 });
    expect((await permanent())?.value.toNumber()).toBe(12);

    await cancel(b, c); // 60 puntos: vuelve al de abajo
    expect((await permanent())?.value.toNumber()).toBe(5);

    await configure({ mode: "GLOBAL" });
    await db.$transaction((tx) => syncAllPermanentDiscounts(tx), { timeout: 30_000 });
    expect((await permanent())?.isActive).toBe(false);
    await configure();
    await db.$transaction((tx) => syncAllPermanentDiscounts(tx), { timeout: 30_000 });
    expect((await permanent())?.isActive).toBe(true);

    await db.loyaltyTier.delete({ where: { id: low.id } });
    await db.$transaction((tx) => syncAllPermanentDiscounts(tx), { timeout: 30_000 });
    expect((await permanent())?.isActive).toBe(false);
  });

  test("un nivel registrado sin premio no bloquea el premio que se le agregue después", async () => {
    const t = await tier("CAFE", 50);
    const c = await customer();
    await buy(c, 80);
    await db.loyaltyTier.update({
      where: { id: t.id },
      data: { pointsRequired: 200, rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 },
    });
    await buy(c, 110);
    expect(await liveCoupons(c)).toHaveLength(0);
    await buy(c, 20); // 190 → 210: cruza el nuevo umbral
    expect(await liveCoupons(c)).toHaveLength(1);
  });

  test("subir el umbral después no le quita a nadie un cupón bien ganado", async () => {
    const t = await tier("CAFE", 100, { rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 });
    const c = await customer();
    await buy(c, 110);
    const [coupon] = await liveCoupons(c);
    await db.loyaltyTier.update({ where: { id: t.id }, data: { pointsRequired: 200 } });
    await db.discountCode.update({ where: { id: coupon.id }, data: { usedAt: new Date() } });
    const b = await sale(c, 30, 0, { discount: 3, codeId: coupon.id });
    await db.$transaction((tx) => awardSalePoints(tx, b, c));
    await cancel(b, c, coupon.id); // se anula la que lo usó, para volver a cobrarla
    expect((await liveCoupons(c)).map((x) => x.id)).toEqual([coupon.id]);
  });

  test("una compra de 0 puntos queda registrada (ticket y conversión)", async () => {
    const c = await customer();
    const s = await buy(c, 0.5);
    const entries = await db.loyaltyPointsEntry.findMany({ where: { saleId: s } });
    expect(entries.map((e) => [e.program, e.points])).toEqual([["GLOBAL", 0]]);
  });

  test("cobros y anulaciones simultáneos del mismo cliente no pierden puntos", async () => {
    await tier("CAFE", 30, { rewardType: "CUPON_PORCENTAJE", rewardPercent: 10 });
    const c = await customer();
    const first = await buy(c, 20);
    const ids = await Promise.all([1, 2, 3, 4, 5].map(() => sale(c, 10)));
    await Promise.all([
      ...ids.map((id) => db.$transaction((tx) => awardSalePoints(tx, id, c), { timeout: 20_000, maxWait: 20_000 })),
      cancel(first, c),
    ]);
    expect((await position(c)).points).toBe(50);
    expect(await liveCoupons(c)).toHaveLength(1);
  });
});
