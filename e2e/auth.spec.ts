import { expect, test } from "@playwright/test";
import { loginAdmin, loginPin, PIN } from "./helpers";

test.describe("Acceso", () => {
  test("PIN incorrecto muestra error en español", async ({ page }) => {
    await page.goto("/");
    await page.fill("#pin", "0000");
    await page.click("button[type=submit]");
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
  });

  test("PIN correcto entra al POS", async ({ page }) => {
    await loginPin(page, PIN.luis);
    await expect(page.getByText("Cuenta actual")).toBeVisible();
  });

  test("Administración con email y password", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByRole("heading", { level: 1, name: "Administración" })).toBeVisible();
  });
});
