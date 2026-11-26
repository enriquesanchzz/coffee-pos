import { expect, test } from "@playwright/test";
import { addProduct, db, loginAdmin, loginPin, PIN, pickOption } from "./helpers";
import { activeBirthday, customerSubject, getUpcomingBirthdays, issueDueBirthdayCoupons, petSubject } from "../lib/birthdays";
import { findAllergyConflicts, normalizeAllergenTags } from "../lib/allergens";
import { couponLabel, COUPON_LABEL_INCLUDE } from "../lib/coupon-label";
import { zonedDateKey } from "../lib/time";

// Mascotas (CRM-01), alertas de alergias en caja (CRM-02) y cupones de
// cumpleaños (CRM-05, lib/birthdays.ts).
const BRANCH = "branch-principal";
const RUN = Date.now() % 1000000;
const TAG = `E2E-Masc-${RUN}`;
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

async function setBirthdays(customerPercent: number, petPercent: number, validDays = 7, leadDays = 30) {
  await db.branch.update({
    where: { id: BRANCH },
    data: {
      birthdayCustomerPercent: customerPercent,
      birthdayPetPercent: petPercent,
      birthdayCouponValidDays: validDays,
      birthdayLeadDays: leadDays,
    },
  });
}

async function createCustomer(name: string, data: { birthDate?: Date; phone?: string } = {}) {
  return db.customer.create({ data: { name: `${name} ${TAG}`, loyaltyCard: { create: {} }, ...data } });
}

async function couponOf(subjectKey: string, year: number) {
  const grant = await db.birthdayGrant.findUnique({
    where: { subjectKey_year: { subjectKey, year } },
    include: { discountCode: { include: COUPON_LABEL_INCLUDE } },
  });
  return grant?.discountCode ?? null;
}

test.afterAll(async () => {
  const customers = await db.customer.findMany({ where: { name: { contains: TAG } }, select: { id: true } });
  const ids = customers.map((c) => c.id);
  await db.birthdayGrant.deleteMany({ where: { customerId: { in: ids } } });
  await db.discountCode.deleteMany({ where: { customerId: { in: ids } } });
  await db.pet.deleteMany({ where: { customerId: { in: ids } } });
  await db.loyaltyCard.deleteMany({ where: { customerId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: ids } } });
  await db.product.updateMany({ where: { name: { contains: TAG } }, data: { isActive: false } });
  await setBirthdays(0, 0, 7);
});

test.describe.serial("Cupones de cumpleaños (motor)", () => {
  // Mediodía en Ciudad de México.
  const NOW = new Date("2026-06-15T18:00:00Z");

  test("el día del cumpleaños: cupón de Cafetería al cliente y de Pet Shop por su mascota", async () => {
    await setBirthdays(10, 15, 7);
    const owner = await createCustomer("Dueña", { birthDate: day("1990-06-15") });
    const rocky = await db.pet.create({ data: { customerId: owner.id, name: `Rocky ${RUN}`, birthDate: day("2020-06-15") } });
    // Cumplió hace 3 días (dentro de 7): se entrega aunque el sistema estuviera apagado.
    const luna = await db.pet.create({ data: { customerId: owner.id, name: `Luna ${RUN}`, birthDate: day("2019-06-12") } });
    // Hace 8 días: su cupón ya habría vencido, no se entrega.
    const max = await db.pet.create({ data: { customerId: owner.id, name: `Max ${RUN}`, birthDate: day("2018-06-07") } });
    // Mañana: todavía no.
    const later = await createCustomer("Mañana", { birthDate: day("1985-06-16") });

    await issueDueBirthdayCoupons(NOW);

    const own = await couponOf(customerSubject(owner.id), 2026);
    expect(own?.businessUnit).toBe("CAFE");
    expect(own?.value.toNumber()).toBe(10);
    expect(own?.customerId).toBe(owner.id);
    expect(own?.code).toMatch(/^CUMPLE-/);
    // Vale 7 días: del 15 al 21 de junio (fin del día en la sucursal).
    expect(zonedDateKey(own!.expiresAt!)).toBe("2026-06-21");
    expect(couponLabel(own!)).toBe("10% en Cafetería · cumpleaños");

    const pet = await couponOf(petSubject(rocky.id), 2026);
    expect(pet?.businessUnit).toBe("PET_SHOP");
    expect(pet?.value.toNumber()).toBe(15);
    expect(pet?.customerId).toBe(owner.id);
    expect(couponLabel(pet!)).toBe(`15% en Pet Shop · cumpleaños de Rocky ${RUN}`);

    const late = await couponOf(petSubject(luna.id), 2026);
    expect(zonedDateKey(late!.expiresAt!)).toBe("2026-06-18");
    expect(await couponOf(petSubject(max.id), 2026)).toBeNull();
    expect(await couponOf(customerSubject(later.id), 2026)).toBeNull();

    // Otra corrida (la de cada hora) no repite nada.
    const before = await db.birthdayGrant.count({ where: { customerId: owner.id } });
    await issueDueBirthdayCoupons(NOW);
    await issueDueBirthdayCoupons(new Date("2026-06-17T18:00:00Z"));
    expect(await db.birthdayGrant.count({ where: { customerId: owner.id } })).toBe(before);

    // Al día siguiente toca el de "Mañana".
    await issueDueBirthdayCoupons(new Date("2026-06-16T18:00:00Z"));
    expect(await couponOf(customerSubject(later.id), 2026)).not.toBeNull();

    const upcoming = await getUpcomingBirthdays(30, NOW);
    const rockyRow = upcoming.find((b) => b.name === `Rocky ${RUN}`);
    expect(rockyRow?.daysAway).toBe(0);
    expect(rockyRow?.turning).toBe(6);
    expect(rockyRow?.coupon?.status).toBe("disponible");
    expect(upcoming.find((b) => b.name === `Luna ${RUN}`)?.daysAway).toBe(-3);
    // Max ya pasó y sin cupón vigente: aparece hasta el próximo año (fuera de 30 días).
    expect(upcoming.find((b) => b.name === `Max ${RUN}`)).toBeUndefined();
  });

  test("no se saca cupón capturando la fecha el mismo día, ni dando de alta otra vez a la mascota", async () => {
    await setBirthdays(10, 15, 7);
    const owner = await createCustomer("Trampa", { birthDate: day("1992-06-15") });
    // La fecha del cliente se cambió hoy mismo (o después de su cumpleaños).
    await db.customer.update({ where: { id: owner.id }, data: { birthDateSetAt: NOW } });
    // Mascota registrada hoy con cumpleaños de hoy: así se "fabricaría" un cupón.
    const fresh = await db.pet.create({
      data: { customerId: owner.id, name: `Nueva ${RUN}`, birthDate: day("2021-06-15"), birthDateSetAt: NOW },
    });
    // Capturada durante la vigencia, con un cumpleaños de hace 2 días.
    const late = await db.pet.create({
      data: {
        customerId: owner.id,
        name: `Tarde ${RUN}`,
        birthDate: day("2021-06-13"),
        birthDateSetAt: new Date("2026-06-14T18:00:00Z"),
      },
    });
    // Registrada 10 días antes: no alcanza los 30 de anticipación.
    const recent = await db.pet.create({
      data: {
        customerId: owner.id,
        name: `Reciente ${RUN}`,
        birthDate: day("2020-06-15"),
        birthDateSetAt: new Date("2026-06-05T18:00:00Z"),
      },
    });
    // Nació hoy: todavía no cumple años.
    const newborn = await db.pet.create({ data: { customerId: owner.id, name: `Recién ${RUN}`, birthDate: day("2026-06-15") } });
    // Registrada desde antes: sí recibe su cupón.
    const old = await db.pet.create({
      data: {
        customerId: owner.id,
        name: `Vieja ${RUN}`,
        birthDate: day("2015-06-15"),
        birthDateSetAt: new Date("2026-01-10T18:00:00Z"),
      },
    });

    await issueDueBirthdayCoupons(NOW);
    expect(await couponOf(customerSubject(owner.id), 2026)).toBeNull();
    expect(await couponOf(petSubject(fresh.id), 2026)).toBeNull();
    expect(await couponOf(petSubject(late.id), 2026)).toBeNull();
    expect(await couponOf(petSubject(newborn.id), 2026)).toBeNull();
    expect(await couponOf(petSubject(recent.id), 2026)).toBeNull();
    expect(await couponOf(petSubject(old.id), 2026)).not.toBeNull();

    // El gerente baja la anticipación a 5 días: la de hace 10 ya alcanza;
    // las capturadas el mismo día o durante la vigencia siguen sin cupón.
    await setBirthdays(10, 15, 7, 5);
    await issueDueBirthdayCoupons(NOW);
    expect(await couponOf(petSubject(recent.id), 2026)).not.toBeNull();
    expect(await couponOf(petSubject(fresh.id), 2026)).toBeNull();
    expect(await couponOf(petSubject(late.id), 2026)).toBeNull();
  });

  test("borrar y volver a dar de alta una mascota no abre lugar para otro cupón ese año", async () => {
    await setBirthdays(0, 15, 7);
    const owner = await createCustomer("Tope");
    const first = await db.pet.create({ data: { customerId: owner.id, name: `Uno ${RUN}`, birthDate: day("2019-06-15") } });
    await issueDueBirthdayCoupons(NOW);
    expect(await couponOf(petSubject(first.id), 2026)).not.toBeNull();

    // Se borra y se "vuelve a dar de alta" (aun con la fecha registrada desde antes).
    await db.pet.delete({ where: { id: first.id } });
    const again = await db.pet.create({
      data: {
        customerId: owner.id,
        name: `Uno otra vez ${RUN}`,
        birthDate: day("2019-06-16"),
        birthDateSetAt: new Date("2026-01-01T18:00:00Z"),
      },
    });
    await issueDueBirthdayCoupons(new Date("2026-06-16T18:00:00Z"));
    expect(await couponOf(petSubject(again.id), 2026)).toBeNull();

    // Con una segunda mascota real, sí hay lugar para la suya.
    const second = await db.pet.create({ data: { customerId: owner.id, name: `Dos ${RUN}`, birthDate: day("2018-06-17") } });
    await issueDueBirthdayCoupons(new Date("2026-06-17T18:00:00Z"));
    expect(await db.birthdayGrant.count({ where: { customerId: owner.id, year: 2026 } })).toBe(2);
    expect((await couponOf(petSubject(second.id), 2026)) ?? (await couponOf(petSubject(again.id), 2026))).not.toBeNull();
  });

  test("con 0% no se regala, y un 29 de febrero se festeja el 28 en años no bisiestos", async () => {
    await setBirthdays(10, 0, 7);
    const leap = await createCustomer("Bisiesto", { birthDate: day("2000-02-29") });
    const pup = await db.pet.create({ data: { customerId: leap.id, name: `Pup ${RUN}`, birthDate: day("2024-02-28") } });
    await issueDueBirthdayCoupons(new Date("2027-02-28T18:00:00Z"));
    expect(await couponOf(customerSubject(leap.id), 2027)).not.toBeNull();
    expect(await couponOf(petSubject(pup.id), 2027)).toBeNull();
  });

  test("un cumpleaños de fin de año se sigue festejando en enero", async () => {
    await setBirthdays(10, 10, 7);
    const dec = await createCustomer("Diciembre", { birthDate: day("1995-12-30") });
    await issueDueBirthdayCoupons(new Date("2027-01-03T18:00:00Z"));
    const coupon = await couponOf(customerSubject(dec.id), 2026);
    expect(zonedDateKey(coupon!.expiresAt!)).toBe("2027-01-05");
    expect(activeBirthday(day("1995-12-30"), "2027-01-06", 7)).toBeNull();
  });
});

test.describe("Alergias (reglas)", () => {
  test("coinciden sin acentos ni mayúsculas y se limpian al guardar", () => {
    expect(normalizeAllergenTags([" Pollo ", "LÁCTEOS", "lacteos", ""])).toEqual(["pollo", "lácteos"]);
    const conflicts = findAllergyConflicts(
      [
        { name: "Rocky", allergies: ["pollo", "lacteos"] },
        { name: "Luna", allergies: [] },
      ],
      [
        { key: "a", productName: "Croquetas", allergenTags: ["Pollo", "arroz"] },
        { key: "b", productName: "Puppuccino", allergenTags: ["lácteos"] },
        { key: "c", productName: "Pelota", allergenTags: [] },
      ]
    );
    expect(conflicts).toEqual([
      { key: "a", productName: "Croquetas", petName: "Rocky", allergens: ["pollo"] },
      { key: "b", productName: "Puppuccino", petName: "Rocky", allergens: ["lacteos"] },
    ]);
  });
});

test.describe.serial("Mascotas en el perfil y en caja", () => {
  const TREAT = `Premio de pollo ${TAG}`;
  let customerName: string;
  let customerId: string;

  test.beforeAll(async () => {
    const category = await db.productCategory.create({ data: { name: `Premios ${TAG}`, businessUnit: "PET_SHOP" } });
    await db.product.create({
      data: {
        name: TREAT,
        categoryId: category.id,
        type: "REVENTA_DIRECTA",
        allergenTags: ["pollo"],
        branchProducts: { create: { branchId: BRANCH } },
        variants: { create: { name: "Bolsa", price: 80 } },
      },
    });
    const customer = await createCustomer("Tutor", { phone: `56${String(RUN).padStart(8, "0")}` });
    customerName = customer.name;
    customerId = customer.id;
  });

  test("el admin registra una mascota con alergias en el perfil del cliente", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`/clientes/${customerId}`);
    await page.getByRole("button", { name: "Agregar mascota" }).click();
    await page.fill("#pet-name", "Rocky");
    await page.getByRole("radio", { name: "Perro" }).click();
    await page.fill("#pet-breed", "Schnauzer");
    await page.fill("#pet-weight", "7,5");
    await page.fill("#pet-birthday", "2021-03-10");
    await page.fill("#pet-allergies", "Pollo");
    await page.keyboard.press("Enter");
    // Lo que se deja escrito se agrega al salir del campo.
    await page.fill("#pet-allergies", "lácteos");
    await page.getByRole("button", { name: "Guardar mascota" }).click();
    await expect(page.getByText("Alergias: pollo, lácteos")).toBeVisible();
    await expect(page.getByText("Perro · Schnauzer · 7.5 kg · cumple 10/03/2021")).toBeVisible();

    const pet = await db.pet.findFirstOrThrow({ where: { customerId } });
    expect(pet.allergies).toEqual(["pollo", "lácteos"]);
    expect(pet.weightKg?.toNumber()).toBe(7.5);
    expect(pet.birthDate?.toISOString().slice(0, 10)).toBe("2021-03-10");
    expect(pet.birthDateSetAt).not.toBeNull();

    // Editar otra cosa no "reinicia" la fecha para los cupones de cumpleaños.
    await page.getByRole("button", { name: "Editar a Rocky" }).click();
    await page.fill("#pet-breed", "Schnauzer mini");
    await page.getByRole("button", { name: "Guardar mascota" }).click();
    await expect(page.getByText("Perro · Schnauzer mini · 7.5 kg · cumple 10/03/2021")).toBeVisible();
    const edited = await db.pet.findUniqueOrThrow({ where: { id: pet.id } });
    expect(edited.birthDateSetAt?.getTime()).toBe(pet.birthDateSetAt?.getTime());

    // Un cumpleaños en el futuro no se acepta.
    await page.getByRole("button", { name: "Agregar mascota" }).click();
    await page.fill("#pet-name", "Futuro");
    await page.fill("#pet-birthday", "2099-01-01");
    await page.getByRole("button", { name: "Guardar mascota" }).click();
    await expect(page.getByText("La fecha de cumpleaños no puede ser futura.")).toBeVisible();
    expect(await db.pet.count({ where: { customerId } })).toBe(1);
  });

  test("caja avisa si se agrega un producto que contiene la alergia de una mascota", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await pickOption(page.locator("#customer"), customerName, new RegExp(`^${customerName}`));
    await expect(page.getByText("Rocky · alergias: pollo, lácteos")).toBeVisible();

    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await expect(page.getByRole("alert").filter({ hasText: "Alergias de las mascotas" })).toBeHidden();

    await addProduct(page, TREAT);
    const alert = page.getByRole("alert").filter({ hasText: "Alergias de las mascotas" });
    await expect(alert).toContainText(`${TREAT} contiene pollo (alergia de Rocky)`);
    await expect(page.getByText("⚠ Alergia — Rocky: pollo")).toBeVisible();

    // Sin cliente no hay a quién cuidar: el aviso desaparece.
    await page.locator("p", { hasText: `Seleccionado: ${customerName}` }).getByRole("button", { name: "Quitar" }).click();
    await expect(alert).toBeHidden();
  });

  test("desde caja se agrega una mascota y su aviso aplica de inmediato", async ({ page }) => {
    const other = await createCustomer("Nuevo tutor");
    await loginPin(page, PIN.ana);
    await pickOption(page.locator("#customer"), other.name, new RegExp(`^${other.name}`));
    await page.getByRole("button", { name: "+ Mascota" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Agregar mascota" }).click();
    await dialog.locator("#pet-name").fill("Kira");
    await dialog.getByRole("radio", { name: "Gato" }).click();
    await dialog.locator("#pet-allergies").fill("POLLO");
    await dialog.locator("#pet-allergies").press("Enter");
    await dialog.getByRole("button", { name: "Guardar mascota" }).click();
    await expect(dialog.getByText("Alergias: pollo")).toBeVisible();
    await dialog.getByRole("button", { name: "Cerrar" }).first().click();

    await expect(page.getByRole("button", { name: "Mascotas (1)" })).toBeVisible();
    await addProduct(page, TREAT);
    await expect(page.getByRole("alert").filter({ hasText: "Alergias de las mascotas" })).toContainText("(alergia de Kira)");
    expect((await db.pet.findFirstOrThrow({ where: { customerId: other.id } })).species).toBe("GATO");
  });

  test("cumpleaños de hoy: aviso en caja, cupón y felicitación en Clientes → Cumpleaños", async ({ page }) => {
    await setBirthdays(10, 15, 7);
    const today = zonedDateKey(new Date());
    const pet = await db.pet.findFirstOrThrow({ where: { customerId, name: "Rocky" } });
    // Fecha registrada con más de 30 días de anticipación (si no, no daría cupón).
    await db.pet.update({
      where: { id: pet.id },
      data: { birthDate: day(`2021-${today.slice(5)}`), birthDateSetAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    await issueDueBirthdayCoupons();
    const coupon = await couponOf(petSubject(pet.id), Number(today.slice(0, 4)));
    expect(coupon?.businessUnit).toBe("PET_SHOP");

    await loginPin(page, PIN.ana);
    await pickOption(page.locator("#customer"), customerName, new RegExp(`^${customerName}`));
    await expect(page.getByText("🎂 ¡Hoy cumple Rocky!")).toBeVisible();
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    await page.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.getByRole("button", { name: new RegExp(coupon!.code) })).toBeVisible();

    await loginAdmin(page);
    await page.goto("/clientes/cumpleanos");
    const row = page.locator("div.py-3", { hasText: "Rocky" }).filter({ hasText: customerName });
    await expect(row).toContainText("Hoy");
    await expect(row).toContainText(coupon!.code);
    const href = await row.getByRole("link", { name: "Felicitar por WhatsApp" }).getAttribute("href");
    expect(href).toContain("wa.me/52");
    expect(decodeURIComponent(href!)).toContain(`Feliz cumpleaños a Rocky`);
    expect(decodeURIComponent(href!)).toContain(coupon!.code);
  });
});
