import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { db, loginAdmin, loginPin, PIN } from "./helpers";

// Barrido axe de todas las rutas (A11Y): no se aceptan violaciones
// críticas ni serias.
async function routes() {
  const [customer, order, supplier, count, transfer, employee, card] = await Promise.all([
    db.customer.findFirst(),
    db.purchaseOrder.findFirst(),
    db.supplier.findFirst(),
    db.physicalCount.findFirst(),
    db.transferManifest.findFirst(),
    db.employee.findFirst(),
    db.loyaltyCard.findFirst(),
  ]);
  return [
    "/pos",
    "/caja",
    "/administracion",
    "/clientes",
    "/clientes/nuevo",
    customer && `/clientes/${customer.id}`,
    "/compras",
    "/compras/nueva",
    order && `/compras/${order.id}`,
    "/compras/proveedores",
    "/compras/proveedores/nuevo",
    supplier && `/compras/proveedores/${supplier.id}`,
    "/compras/conteos",
    "/compras/conteos/nuevo",
    count && `/compras/conteos/${count.id}`,
    "/compras/transferencias",
    "/compras/transferencias/nueva",
    transfer && `/compras/transferencias/${transfer.id}`,
    "/configuracion",
    "/configuracion/cobro",
    "/configuracion/caja",
    "/configuracion/impuestos",
    "/configuracion/descuentos",
    "/configuracion/lealtad",
    "/configuracion/inventario",
    "/configuracion/costos",
    "/configuracion/seguridad",
    "/configuracion/apariencia",
    "/descuentos",
    "/empleados",
    "/empleados/nuevo",
    employee && `/empleados/${employee.id}`,
    "/inventario",
    "/productos",
    "/promociones",
    "/reportes",
    card && `/lealtad/${card.code}`,
    "/ruta-que-no-existe",
  ].filter((r): r is string => Boolean(r));
}

test("ninguna ruta tiene violaciones axe críticas o serias", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAdmin(page);
  const problems: string[] = [];
  for (const route of await routes()) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).analyze();
    for (const v of results.violations) {
      if (v.impact === "critical" || v.impact === "serious") {
        problems.push(`${route} · ${v.id} (${v.impact}) · ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      }
    }
    const title = await page.title();
    if (!/·/.test(title)) problems.push(`${route} · título genérico "${title}"`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("login por PIN sin violaciones", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});

test("cada pantalla tiene exactamente un h1 y no salta niveles", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAdmin(page);
  const problems: string[] = [];
  for (const route of await routes()) {
    await page.goto(route);
    const levels = await page.locator("h1, h2, h3, h4").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    if (levels.filter((l) => l === 1).length !== 1) problems.push(`${route}: ${levels.filter((l) => l === 1).length} h1`);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) problems.push(`${route}: h${levels[i - 1]} → h${levels[i]}`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("venta completa solo con teclado", async ({ page }) => {
  await loginPin(page, PIN.ana);
  // Skip link: primer Tab, lleva al contenido.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#contenido")).toBeFocused();

  await page.getByPlaceholder("Buscar en todo el menú…").focus();
  await page.keyboard.type("Latte");
  await page.locator(".aspect-square:visible").filter({ hasText: "Latte" }).first().focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  for (const name of ["Chico", "Caliente"]) {
    await dialog.getByRole("button", { name, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await dialog.getByRole("button", { name: "Agregar al carrito" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Cobrar" }).focus();
  await page.keyboard.press("Enter");
  const exact = page.getByRole("button", { name: "Exacto" });
  await expect(exact).toBeEnabled();
  await exact.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("button", { name: "Confirmar venta" });
  await expect(confirm).toBeEnabled();
  await confirm.focus();
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Venta registrada");
});
