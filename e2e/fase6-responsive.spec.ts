import { expect, test } from "@playwright/test";
import { addProduct, db, loginAdmin, loginPin, PIN } from "./helpers";

test.describe("QA-005 POS en celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la cuenta se abre como hoja inferior y Confirmar queda a la vista", async ({ page }) => {
    await loginPin(page, PIN.ana);
    await addProduct(page, "Latte", ["Chico", "Caliente"]);
    const bar = page.getByRole("button", { name: /Ver cuenta · 1 producto/ });
    await expect(bar).toBeVisible();
    await bar.click();
    const sheet = page.getByRole("region", { name: "Cuenta" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Cobrar" }).click();
    await sheet.getByRole("button", { name: "Exacto" }).click();
    const confirm = sheet.getByRole("button", { name: "Confirmar venta" });
    await expect(confirm).toBeInViewport();
    await confirm.click();
    await expect(page.getByRole("status").filter({ hasText: "Venta registrada" })).toBeVisible();

    await sheet.getByRole("button", { name: "Seguir agregando" }).click();
    await expect(sheet).toBeHidden();
  });

  test("ninguna pantalla principal desborda horizontalmente", async ({ page }) => {
    await loginAdmin(page);
    const overflowing: string[] = [];
    for (const route of ["/pos", "/caja", "/inventario", "/compras", "/clientes", "/productos", "/promociones", "/reportes"]) {
      await page.goto(route);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (scroll > 1) overflowing.push(`${route}: +${scroll}px`);
    }
    expect(overflowing).toEqual([]);
  });
});

test.describe("Textos y validaciones", () => {
  test("QA-029 PIN vacío pide escribirlo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Escribe tu PIN.")).toBeVisible();
    await expect(page.locator("#pin")).toHaveAttribute("maxlength", "6");
  });

  test("QA-024 duplicado con mensaje del negocio (no nombres de columna)", async ({ page }) => {
    const existing = await db.customer.create({ data: { name: `Dup E2E ${Date.now()}`, phone: `55${String(Date.now()).slice(-8)}` } });
    await loginAdmin(page);
    await page.goto("/clientes/nuevo");
    await page.fill("#name", "Otro cliente");
    await page.fill("#phone", existing.phone!);
    await page.getByRole("button", { name: /Crear|Guardar/ }).click();
    await expect(page.getByText(/Ya existe un cliente con ese teléfono/)).toBeVisible();
  });

  test("Compras y Reportes usan la columna de secciones del POS", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/compras/proveedores");
    const nav = page.getByRole("navigation", { name: "Secciones de Compras" });
    await expect(nav.getByRole("link", { name: "Proveedores" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Conteos físicos" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Conteos físicos" })).toBeVisible();

    // Las pantallas internas dejan marcada su sección.
    await page.goto("/compras/nueva");
    await expect(nav.getByRole("link", { name: "Órdenes", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goto("/compras/conteos/nuevo");
    await expect(nav.getByRole("link", { name: "Conteos físicos" })).toHaveAttribute("aria-current", "page");

    await page.goto("/reportes");
    const reportes = page.getByRole("navigation", { name: "Reportes" });
    await expect(reportes.getByRole("link", { name: "Utilidad" })).toHaveAttribute("aria-current", "page");
    await reportes.getByRole("link", { name: "Estadísticas" }).click();
    await expect(reportes.getByRole("link", { name: "Estadísticas" })).toHaveAttribute("aria-current", "page");
  });

  test("Promociones y Descuentos filtran por categoría desde la columna", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/promociones");
    const promo = page.getByRole("navigation", { name: "Categorías de promoción" });
    await expect(promo.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
    await promo.getByRole("button", { name: "2x1" }).click();
    await expect(promo.getByRole("button", { name: "2x1" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/descuentos");
    const desc = page.getByRole("navigation", { name: "Categorías de código" });
    await expect(desc.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
  });
});
