// Next.js llama register() una vez al arrancar el servidor (pm2 → next
// start). Aquí se programan las tareas de fondo del POS; hoy solo los
// cupones de cumpleaños (lib/birthdays.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.BIRTHDAY_SCHEDULER === "off") return;
  const { startBirthdayScheduler } = await import("./lib/birthday-scheduler");
  startBirthdayScheduler();
}
