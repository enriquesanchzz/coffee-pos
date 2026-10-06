// Prepara la base de prueba antes de levantar el servidor de prueba (lo
// llama webServer.command en playwright.config.ts). No destructivo a
// propósito: `migrate deploy` crea la base si no existe y aplica las
// migraciones pendientes, y los tres seeds son idempotentes (upserts). Las
// pruebas comparan diferencias (ej. inventario antes/después) y usan
// nombres únicos, así que no necesitan una base vacía. Para empezar de
// cero, borra la base de prueba a mano (nunca la de desarrollo).
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });
run("npx prisma migrate deploy");
run("npx ts-node prisma/seed.ts");
run("npx ts-node prisma/seed-demo.ts");
run("npx ts-node prisma/seed-lapso.ts");
