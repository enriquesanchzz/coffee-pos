import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

// Acento visual usado solo en components/pos/* (reskin al estilo del
// mockup de referencia) — deliberadamente no se toca la variable global
// --primary en app/globals.css para no afectar el resto de la app
// (Compras, Reportes, Administración, etc.).
export const posAccentClass = "bg-orange-500 text-white hover:bg-orange-500/90";
export const posAccentBorderClass = "border-orange-500 bg-orange-500 text-white";

// Unidades que se cuentan de una en una (piezas, shots, pumps, cucharadas)
// — un <input type="number"> para estas debe subir/bajar de 1 en 1, no de
// 0.01 en 0.01 como las unidades continuas (KG/G/L/ML). Bug real: la UI
// mostraba "1.01" al darle una vez a la flecha de incrementar sobre una
// cantidad en piezas.
const DISCRETE_UNITS = new Set(["PIEZA", "ESPRESSO_SHOT", "PUMP", "CUCHARADA"]);

export function unitStep(unit: string | null | undefined): string {
  return unit && DISCRETE_UNITS.has(unit) ? "1" : "0.01";
}

// Link de WhatsApp con el mensaje de la tarjeta de lealtad precargado
// (ver app/lealtad/[code]/page.tsx) — el cajero lo abre y lo manda con
// un clic, no hay envío automático por API (fuera de alcance hasta que
// el negocio tenga una cuenta de WhatsApp Business API, ver
// docs/CONTINUE.md). `origin` viene de `window.location.origin` — esta
// función no toca `window` para poder importarse en cualquier lado.
// Regresa null si el teléfono no tiene dígitos utilizables — sin
// normalización de código de país más allá de quitar lo que no sea
// dígito (limitación conocida).
export function buildWhatsAppLoyaltyLink({
  phone,
  origin,
  loyaltyCardCode,
  welcomeCouponCode,
}: {
  phone: string;
  origin: string;
  loyaltyCardCode: string;
  welcomeCouponCode?: string | null;
}): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  const cardUrl = `${origin}/lealtad/${loyaltyCardCode}`;
  const lines = [`¡Hola! Aquí está tu tarjeta de lealtad de Nomada Café: ${cardUrl}`];
  if (welcomeCouponCode) {
    lines.push(`Tienes un cupón de 10% para tu próxima compra — código ${welcomeCouponCode}.`);
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join(" "))}`;
}
