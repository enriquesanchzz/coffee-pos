import { expect, test } from "@playwright/test";

// Va al final (zz-): deja bloqueado el login por PIN desde localhost
// durante unos minutos. El contador vive en memoria del servidor de prueba,
// que se levanta de nuevo en cada corrida.
test("cambiar X-Forwarded-For en cada intento no evita el bloqueo de PIN", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.9.${i + 1}`, "x-real-ip": `10.9.9.${i + 1}` });
    await page.goto("/");
    await page.fill("#pin", "0000");
    await page.click("button[type=submit]");
    await page.waitForURL(/error=/);
  }
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "10.9.9.200" });
  await page.goto("/");
  await page.fill("#pin", "0000");
  await page.click("button[type=submit]");
  await page.waitForURL(/error=bloqueado/);
  await expect(page).toHaveURL(/error=bloqueado/);
});
