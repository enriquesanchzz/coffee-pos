import { defineConfig, devices } from "@playwright/test";

// Suite e2e de regresión (ver e2e/README.md). Corre contra un build de
// producción (`next start`) y una base PostgreSQL de prueba separada que
// e2e/prepare-db.mjs migra y siembra (sin borrar nada) en cada corrida —
// nunca contra la base de desarrollo. Se prepara dentro de webServer.command porque
// Playwright levanta el servidor antes que globalSetup.
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/nomada_pos_test";

export default defineConfig({
  testDir: "./e2e",
  // Las pruebas comparten una sola base (turno abierto, inventario), así
  // que corren en serie para que una no altere el estado de otra a medias.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
  webServer: {
    command: `node e2e/prepare-db.mjs && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { DATABASE_URL: E2E_DATABASE_URL },
  },
});
