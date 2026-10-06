"use client";

import { setAppTimeZone } from "@/lib/time";

// Aplica la zona horaria de Configuración → Negocio a lib/time.ts en el
// navegador. Se renderiza antes que el resto de la app (app/layout.tsx),
// así que los componentes que formatean fechas ya la ven en su primer
// render. setAppTimeZone es idempotente, por eso puede ir en el render.
export function TimeZoneSync({ timeZone }: { timeZone: string }) {
  setAppTimeZone(timeZone);
  return null;
}
