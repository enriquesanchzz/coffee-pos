import { expect, test } from "@playwright/test";
import { addProduct, db, loginAdmin, loginPin, PIN } from "./helpers";

test.describe("QA-001 último administrador", () => {
  test("la única administradora no puede quitarse el rol", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/empleados/emp-ana");
    await page.selectOption("#role", { label: "BARISTA" });
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    // Primero pide confirmación por ser su propio acceso...
    await page.getByRole("dialog").getByRole("button", { name: "Sí, guardar" }).click();
    // ...y el servidor lo rechaza porque no queda otro administrador.
    await expect(page.getByText("Debe quedar al menos un administrador activo")).toBeVisible();

    const anaBranch = await db.employeeBranch.findFirstOrThrow({
      where: { employeeId: "emp-ana" },
      include: { role: true },
    });
    expect(anaBranch.role.name).toBe("ADMINISTRADOR");
  });
});

test.describe("QA-002 paquetes", () => {
  test("no se puede guardar un paquete más caro que sus productos", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/promociones");
    await page.getByRole("button", { name: "+ Paquete" }).click();
    const dialog = page.getByRole("dialog");
    await page.fill("#combo-name", `Caro E2E ${Date.now()}`);
    await page.fill("#combo-price", "500");
    await dialog.locator("select").nth(0).selectOption({ label: "Latte Chico — Caliente" });
    await dialog.locator("select").nth(1).selectOption({ label: "Americano Chico — Caliente" });
    await expect(dialog.getByText("debe costar menos")).toBeVisible();
    await dialog.getByRole("button", { name: /Crear|Guardar/ }).click();
    await expect(dialog.getByText("El paquete debe costar menos que sus productos por separado ($70.00).")).toBeVisible();
  });

  test("un paquete válido se aplica y el cobro muestra la promoción", async ({ page }) => {
    const name = `Combo E2E ${Date.now()}`;
    const [latte, americano] = await Promise.all([
      db.productVariant.findFirstOrThrow({ where: { name: "Chico", temperature: "CALIENTE", product: { name: "Latte" } } }),
      db.productVariant.findFirstOrThrow({ where: { name: "Chico", temperature: "CALIENTE", product: { name: "Americano" } } }),
    ]);
    const combo = await db.combo.create({
      data: {
        name,
        price: 60,
        items: {
          create: [
            { productId: latte.productId, productVariantId: latte.id, quantity: 1 },
            { productId: americano.productId, productVariantId: americano.id, quantity: 1 },
          ],
        },
      },
    });
    // Un paquete "caro" guardado antes de la validación tampoco se aplica.
    const legacy = await db.combo.create({
      data: {
        name: `${name} caro`,
        price: 500,
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
      await expect(page.getByText("$60.00").first()).toBeVisible();
      await expect(page.getByText(`Promoción: ${name} caro`)).toHaveCount(0);
    } finally {
      await db.combo.updateMany({ where: { id: { in: [combo.id, legacy.id] } }, data: { isActive: false } });
    }
  });
});
