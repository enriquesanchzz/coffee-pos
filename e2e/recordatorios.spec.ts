import { expect, test } from "@playwright/test";
import { db, loginAdmin } from "./helpers";
import { getDueReminders, type ReminderSettings } from "../lib/reminders";
import { DEFAULT_SETTINGS } from "../lib/settings-shared";

// Recordatorios por WhatsApp (lib/reminders.ts): "te extrañamos" de
// Cafetería y resurtido de Pet Shop.
const BRANCH = "branch-principal";
const RUN = `${Date.now() % 10_000_000}`;
const TAG = `E2E-Rec-${RUN}`;
const DAY = 86_400_000;
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const SETTINGS: ReminderSettings = {
  businessName: "Nomada Test",
  reminderCafeDays: 30,
  reminderCafeMessage: DEFAULT_SETTINGS.reminderCafeMessage,
  reminderPetShopDays: 30,
  reminderPetShopMessage: DEFAULT_SETTINGS.reminderPetShopMessage,
};

let shiftId: string;
let employeeId: string;
const variant: Record<"cafe" | "galleta" | "hueso" | "collar", string> = { cafe: "", galleta: "", hueso: "", collar: "" };
const product: Record<keyof typeof variant, string> = { cafe: "", galleta: "", hueso: "", collar: "" };
let n = 0;

test.beforeAll(async () => {
  const shift = await db.shift.findFirstOrThrow({ orderBy: { openedAt: "desc" } });
  shiftId = shift.id;
  employeeId = shift.cashierId;
  const cafeCat = await db.productCategory.create({ data: { name: `Rec Café ${RUN}`, businessUnit: "CAFE" } });
  const petCat = await db.productCategory.create({ data: { name: `Rec Pet ${RUN}`, businessUnit: "PET_SHOP" } });
  const make = async (key: keyof typeof variant, name: string, categoryId: string, extra = {}) => {
    const p = await db.product.create({
      data: { name: `${name} ${TAG}`, categoryId, type: "REVENTA_DIRECTA", variants: { create: { name: "U", price: 50 } }, ...extra },
      include: { variants: true },
    });
    await db.branchProduct.create({ data: { branchId: BRANCH, productId: p.id, isActive: true } });
    product[key] = p.id;
    variant[key] = p.variants[0].id;
  };
  await make("cafe", "Cortado Rec", cafeCat.id);
  await make("galleta", "Galletas", petCat.id);
  // Juguete: se recuerda a los 7 días con su propio mensaje.
  await make("hueso", "Hueso", petCat.id, { reminderDays: 7, reminderMessage: "¿{mascota} ya acabó su {productos}, {cliente}?" });
  // Accesorio: nunca.
  await make("collar", "Collar", petCat.id, { reminderDays: 0 });
});

test.afterAll(async () => {
  const customers = await db.customer.findMany({ where: { name: { contains: TAG } }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  await db.customerReminder.deleteMany({ where: { customerId: { in: ids } } });
  const sales = await db.sale.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
  await db.saleItem.deleteMany({ where: { saleId: { in: sales.map((s) => s.id) } } });
  await db.sale.deleteMany({ where: { id: { in: sales.map((s) => s.id) } } });
  await db.pet.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
  await db.product.updateMany({ where: { name: { contains: TAG } }, data: { isActive: false } });
  await db.branch.update({
    where: { id: BRANCH },
    data: { reminderCafeDays: 30, reminderCafeMessage: null, reminderPetShopDays: 30, reminderPetShopMessage: null },
  });
});

async function customer(name: string, phone: string | null = null) {
  n += 1;
  return db.customer.create({ data: { name: `${name} ${TAG}-${n}`, phone } });
}

async function sale(customerId: string, items: (keyof typeof variant)[], createdAt: Date, status: "COMPLETADA" | "CANCELADA" = "COMPLETADA") {
  await db.sale.create({
    data: {
      branchId: BRANCH,
      shiftId,
      employeeId,
      customerId,
      status,
      subtotal: 50 * items.length,
      total: 50 * items.length,
      createdAt,
      items: { create: items.map((k) => ({ productVariantId: variant[k], quantity: 1, unitPrice: 50, lineTotal: 50 })) },
    },
  });
}

async function dueFor(customerId: string, settings: ReminderSettings = SETTINGS) {
  return (await getDueReminders(settings, NOW)).filter((r) => r.customerId === customerId);
}

test.describe.serial("Recordatorios (motor)", () => {
  test("Cafetería: te extrañamos a los 30 días de su última compra de café", async () => {
    const away = await customer("Ana María", "5512345678");
    await sale(away.id, ["cafe"], daysAgo(45));
    await sale(away.id, ["cafe"], daysAgo(31));
    const recent = await customer("Reciente");
    await sale(recent.id, ["cafe"], daysAgo(40));
    await sale(recent.id, ["cafe"], daysAgo(10));
    // Su última compra de café fue cancelada: cuenta la anterior.
    const cancelled = await customer("Cancelada");
    await sale(cancelled.id, ["cafe"], daysAgo(35));
    await sale(cancelled.id, ["cafe"], daysAgo(3), "CANCELADA");
    // Comprar en Pet Shop no cuenta como visita a la cafetería.
    const petOnly = await customer("Solo pet");
    await sale(petOnly.id, ["cafe"], daysAgo(40));
    await sale(petOnly.id, ["collar"], daysAgo(2));

    const [r] = await dueFor(away.id);
    expect(r.kind).toBe("CAFE_TE_EXTRANAMOS");
    expect(r.daysSince).toBe(31);
    expect(r.message).toBe(
      "¡Hola, Ana! ☕ Hace tiempo que no te vemos por Nomada Test y te extrañamos. Te esperamos pronto para tu próximo café."
    );
    expect(r.whatsAppHref).toBe(`https://wa.me/525512345678?text=${encodeURIComponent(r.message)}`);
    expect(await dueFor(recent.id)).toHaveLength(0);
    expect((await dueFor(cancelled.id)).map((x) => x.kind)).toEqual(["CAFE_TE_EXTRANAMOS"]);
    expect((await dueFor(petOnly.id)).map((x) => x.kind)).toEqual(["CAFE_TE_EXTRANAMOS"]);
    // Sin teléfono: sale, pero sin link.
    expect((await dueFor(cancelled.id))[0].whatsAppHref).toBeNull();
    // Apagado.
    expect(await dueFor(away.id, { ...SETTINGS, reminderCafeDays: 0 })).toHaveLength(0);
  });

  test("Cafetería: atendido no se repite hasta una compra nueva", async () => {
    const c = await customer("Repite");
    await sale(c.id, ["cafe"], daysAgo(80));
    await db.customerReminder.create({
      data: { customerId: c.id, kind: "CAFE_TE_EXTRANAMOS", action: "ENVIADO", createdAt: daysAgo(45) },
    });
    expect(await dueFor(c.id)).toHaveLength(0);
    // Regresó después del recordatorio y otra vez lleva 30+ días sin venir.
    await sale(c.id, ["cafe"], daysAgo(33));
    expect(await dueFor(c.id)).toHaveLength(1);
  });

  test("Pet Shop: un mensaje por cliente; días y mensaje propios por producto", async () => {
    const c = await customer("Luis Pérez", "5587654321");
    await db.pet.create({ data: { customerId: c.id, name: "Rocky" } });
    await db.pet.create({ data: { customerId: c.id, name: "Luna" } });
    // Hueso (7 días) y collar (nunca) hace 10 días; galletas (general, 30) hace 31.
    await sale(c.id, ["hueso", "collar"], daysAgo(10));
    await sale(c.id, ["galleta"], daysAgo(31));

    const [r] = await dueFor(c.id);
    expect(r.kind).toBe("PET_SHOP_RESURTIDO");
    expect(r.products.map((p) => p.id)).toEqual([product.hueso, product.galleta]);
    expect(r.message).toBe(
      `¡Hola, Luis! 🐾 ¿Qué tal le fue a Rocky y Luna con Galletas ${TAG}? Cuando quieras más, en Nomada Test te esperamos.\n\n` +
        `¿Rocky y Luna ya acabó su Hueso ${TAG}, Luis?`
    );

    // Las galletas a los 20 días todavía no tocan; sin mascotas = "tu mascota".
    const d = await customer("Sin mascota");
    await sale(d.id, ["galleta"], daysAgo(20));
    await sale(d.id, ["hueso"], daysAgo(8));
    const [s] = await dueFor(d.id);
    expect(s.products.map((p) => p.id)).toEqual([product.hueso]);
    expect(s.message).toBe(`¿tu mascota ya acabó su Hueso ${TAG}, Sin?`);
  });

  test("Pet Shop: se atiende por producto", async () => {
    const c = await customer("Por producto");
    await sale(c.id, ["galleta"], daysAgo(40));
    await db.customerReminder.create({
      data: { customerId: c.id, kind: "PET_SHOP_RESURTIDO", productId: product.galleta, action: "OMITIDO", createdAt: daysAgo(5) },
    });
    expect(await dueFor(c.id)).toHaveLength(0);
    // Un producto distinto comprado antes de ese recordatorio sigue pendiente.
    await sale(c.id, ["hueso"], daysAgo(9));
    expect((await dueFor(c.id))[0].products.map((p) => p.id)).toEqual([product.hueso]);
  });
});

test.describe.serial("Recordatorios (pantalla)", () => {
  test("enviar u omitir lo saca de la lista; la configuración cambia el mensaje", async ({ page }) => {
    const c = await customer("Marta", "5511112222");
    await sale(c.id, ["cafe"], daysAgo(40));
    const fullName = `Marta ${TAG}-${n}`;

    await loginAdmin(page);
    await page.goto("/clientes/recordatorios");
    await page.getByLabel("Mensaje", { exact: true }).fill("Hola {cliente}, te extrañamos en {negocio}");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect
      .poll(async () => (await db.branch.findUniqueOrThrow({ where: { id: BRANCH } })).reminderCafeMessage)
      .toBe("Hola {cliente}, te extrañamos en {negocio}");

    await page.goto("/administracion");
    await expect(page.getByRole("link", { name: "Ver recordatorios" })).toBeVisible();

    await page.goto("/clientes/recordatorios");
    const row = page.getByTestId("reminder-row").filter({ hasText: fullName });
    await expect(row).toContainText("Hola Marta, te extrañamos en");
    const link = row.getByRole("link", { name: "Enviar por WhatsApp" });
    await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/525511112222\?text=Hola%20Marta/);

    // El link abre otra pestaña; aquí basta con que quede registrado.
    const popup = page.waitForEvent("popup");
    await link.click();
    await (await popup).close();
    await expect(row).toHaveCount(0);
    await expect
      .poll(() => db.customerReminder.count({ where: { customerId: c.id, kind: "CAFE_TE_EXTRANAMOS", action: "ENVIADO" } }))
      .toBe(1);
    await page.reload();
    await expect(page.getByTestId("reminder-row").filter({ hasText: fullName })).toHaveCount(0);

    // Omitir uno de Pet Shop.
    const p = await customer("Omar");
    await sale(p.id, ["galleta"], daysAgo(31));
    await page.reload();
    const petRow = page.getByTestId("reminder-row").filter({ hasText: `Omar ${TAG}` });
    await expect(petRow).toContainText("Sin teléfono");
    await petRow.getByRole("button", { name: "Omitir" }).click();
    await expect(petRow).toHaveCount(0);
    await expect
      .poll(() => db.customerReminder.findMany({ where: { customerId: p.id }, select: { productId: true, action: true } }))
      .toEqual([{ productId: product.galleta, action: "OMITIDO" }]);
  });

  test("mensaje propio de un producto de Pet Shop desde Productos", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/productos");
    await page.getByLabel("Buscar producto").fill(`Galletas ${TAG}`);
    await page.getByRole("button", { name: new RegExp(`Galletas ${TAG}`) }).first().click();
    await page.getByRole("button", { name: /^U\b/ }).click();
    await expect(page.getByLabel("Mensaje propio")).toBeVisible();
    await page.getByLabel("Días después de la compra").fill("14");
    await page.getByLabel("Mensaje propio").fill("Ya casi se acaban las {productos}");
    await page.getByRole("button", { name: /Guardar/ }).first().click();
    await expect
      .poll(async () => db.product.findUniqueOrThrow({ where: { id: product.galleta }, select: { reminderDays: true, reminderMessage: true } }))
      .toEqual({ reminderDays: 14, reminderMessage: "Ya casi se acaban las {productos}" });
  });
});
