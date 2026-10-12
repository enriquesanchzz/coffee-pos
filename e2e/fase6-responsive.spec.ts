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

  test("Configuración se divide por tipo de ajuste en la columna", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/configuracion");
    const nav = page.getByRole("navigation", { name: "Secciones de Configuración" });
    await expect(nav.getByRole("link", { name: "Negocio" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Costos y precios" }).click();
    await expect(nav.getByRole("link", { name: "Costos y precios" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("% de food cost objetivo")).toBeVisible();
    await nav.getByRole("link", { name: "Apariencia" }).click();
    await expect(nav.getByRole("link", { name: "Apariencia" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Guardar apariencia" })).toBeVisible();
  });
});

// Ningún texto visible ni placeholder se corta, incluso con la letra más
// grande y la tipografía "Redondeada" (Configuración → Apariencia).
test.describe("Textos completos en cualquier ancho", () => {
  const ROUTES = [
    "/pos",
    "/caja",
    "/clientes",
    "/compras/nueva",
    "/compras/transferencias/nueva",
    "/descuentos",
    "/promociones",
    "/inventario",
    "/configuracion",
    "/configuracion/cobro",
    "/configuracion/lealtad",
    "/configuracion/inventario",
  ];

  test.beforeAll(async () => {
    await db.branch.update({ where: { id: "branch-principal" }, data: { themeFontFamily: "rounded", themeFontSize: "lg" } });
  });
  test.afterAll(async () => {
    await db.branch.update({ where: { id: "branch-principal" }, data: { themeFontFamily: null, themeFontSize: null } });
  });

  for (const width of [390, 1024, 1333]) {
    test(`sin textos cortados a ${width}px`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 880 });
      await loginAdmin(page);
      const problems: string[] = [];
      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("load");
        const found = await page.evaluate(() => {
          const res: string[] = [];
          const ctx = document.createElement("canvas").getContext("2d")!;
          for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
            const cs = getComputedStyle(el);
            if (!el.offsetParent && cs.position !== "fixed") continue;
            // Solo para lectores de pantalla (sr-only) o recortes intencionales.
            if (el.closest(".sr-only, [class*='line-clamp'], footer")) continue;
            if (el instanceof HTMLInputElement && el.placeholder && !el.value) {
              ctx.font = cs.font;
              const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
              if (ctx.measureText(el.placeholder).width > avail + 1) res.push(`placeholder "${el.placeholder}"`);
              continue;
            }
            const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
            if (!hasText) continue;
            if (el.scrollWidth > el.clientWidth + 1 && (cs.overflowX !== "visible" || cs.textOverflow === "ellipsis")) {
              res.push(`"${(el.textContent || "").trim().slice(0, 40)}"`);
            }
          }
          return [...new Set(res)];
        });
        for (const f of found) problems.push(`${route}: ${f}`);
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});
