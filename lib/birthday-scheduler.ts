import { issueDueBirthdayCoupons } from "./birthdays";

// Revisa los cumpleaños al arrancar y luego cada hora (ver
// instrumentation.ts). Una corrida que falla (p. ej. la base todavía no
// arranca) solo se registra en el log: la siguiente lo vuelve a intentar.
const FIRST_RUN_DELAY_MS = 20_000;
const INTERVAL_MS = 60 * 60 * 1000;

let started = false;
let running = false;

async function run() {
  if (running) return;
  running = true;
  try {
    const issued = await issueDueBirthdayCoupons();
    if (issued > 0) console.log(`[cumpleaños] ${issued} cupón(es) entregado(s).`);
  } catch (err) {
    console.error("[cumpleaños] No se pudieron revisar los cumpleaños:", err);
  } finally {
    running = false;
  }
}

export function startBirthdayScheduler() {
  if (started) return;
  started = true;
  setTimeout(run, FIRST_RUN_DELAY_MS).unref();
  setInterval(run, INTERVAL_MS).unref();
}
