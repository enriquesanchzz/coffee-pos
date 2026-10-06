import { randomBytes, scryptSync } from "crypto";
import { expect, test, type Page } from "@playwright/test";
import { db, loginPin, PIN } from "./helpers";

// Mismo formato "salt:hash" que lib/password.ts.
function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
}

async function closeOpenShifts() {
  await db.shift.updateMany({ where: { status: "ABIERTO" }, data: { status: "CERRADO", closedAt: new Date() } });
}

async function openShift(page: Page, confirmingPin: string) {
  await page.goto("/pos");
  await page.fill("#openingCash", "1000");
  await page.fill("#confirmingPin", confirmingPin);
  await page.getByRole("button", { name: "Abrir turno" }).click();
}

// Al terminar queda un turno abierto, como lo dejan los seeds, para las
// demás pruebas.
test.describe.serial("Apertura de caja", () => {
  test("la administradora abre su turno con un barista como testigo", async ({ page }) => {
    await closeOpenShifts();
    await loginPin(page, PIN.ana);
    await openShift(page, PIN.luis);
    await expect(page.getByPlaceholder("Buscar en todo el menú…")).toBeVisible();
  });

  test("un barista abre con autorización de la administradora", async ({ page }) => {
    await closeOpenShifts();
    await loginPin(page, PIN.luis);
    await openShift(page, PIN.ana);
    await expect(page.getByPlaceholder("Buscar en todo el menú…")).toBeVisible();
  });

  test("dos baristas solos no pueden abrir, con un mensaje claro", async ({ page }) => {
    const pin = "4826";
    const barista = await db.employee.findFirst({ where: { name: "Barista E2E" } });
    const role = await db.role.findUniqueOrThrow({ where: { name: "BARISTA" } });
    const employee =
      barista ??
      (await db.employee.create({
        data: {
          name: "Barista E2E",
          pin: hashPin(pin),
          branches: { create: { branchId: "branch-principal", roleId: role.id } },
        },
      }));
    await closeOpenShifts();
    await loginPin(page, PIN.luis);
    await openShift(page, pin);
    await expect(
      page.getByText(`Ni tú ni ${employee.name} tienen permiso para abrir caja. Uno de los dos debe ser gerente o administrador.`)
    ).toBeVisible();

    await openShift(page, PIN.ana);
    await expect(page.getByPlaceholder("Buscar en todo el menú…")).toBeVisible();
  });
});
