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

// Acento visual usado en components/pos/* — antes un naranja fijo
// (bg-orange-500), independiente de --primary a propósito porque no
// existía todavía un sistema de tema real. Ahora que Administración →
// Apariencia sí controla --primary/--primary-foreground para toda la app
// (ver lib/theme.ts), el POS debe seguir ese mismo acento — de lo
// contrario cambiar el color en Apariencia no se refleja en la pantalla
// que más usa el cajero.
export const posAccentClass = "bg-primary text-primary-foreground hover:bg-primary/90";
export const posAccentBorderClass = "border-primary bg-primary text-primary-foreground";

// Unidades que se cuentan de una en una (piezas, shots, pumps, cucharadas)
// — un <input type="number"> para estas debe subir/bajar de 1 en 1, no de
// 0.01 en 0.01 como las unidades continuas (KG/G/L/ML). Bug real: la UI
// mostraba "1.01" al darle una vez a la flecha de incrementar sobre una
// cantidad en piezas.
const DISCRETE_UNITS = new Set(["PIEZA", "ESPRESSO_SHOT", "PUMP", "CUCHARADA"]);

export function unitStep(unit: string | null | undefined): string {
  return unit && DISCRETE_UNITS.has(unit) ? "1" : "0.01";
}

// Validación mínima de formato (algo@algo.algo) — suficiente para atrapar
// errores de captura como "no-es-email" sin rechazar direcciones reales.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Etiqueta corta para UnitOfMeasure (antes había copias por módulo y el POS
// mostraba el valor crudo del enum, ej. "ESPRESSO_SHOT").
export const UNIT_LABELS: Record<string, string> = {
  KG: "kg",
  G: "g",
  L: "L",
  ML: "ml",
  PUMP: "pump",
  PIEZA: "pza",
  CUCHARADA: "cda",
  ESPRESSO_SHOT: "shot",
};

export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return "";
  return UNIT_LABELS[unit] ?? unit.toLowerCase();
}

// "1 producto" / "2 productos".
export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Costo unitario de insumos: muchos cuestan centavos por ml/g, y con 2
// decimales se veían como "$0.00" aunque el total del renglón no fuera 0.
export function formatUnitCost(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: amount !== 0 && Math.abs(amount) < 1 ? 4 : 2,
  }).format(amount);
}

// wa.me exige el número en formato internacional sin "+". Los teléfonos
// se capturan normalmente a 10 dígitos (México) — sin la lada de país el
// link abría un chat con un número inexistente. Se antepone 52 a números
// de 10 dígitos; si ya traen 52/521 o cualquier otra lada (>10 dígitos) se
// respetan tal cual.
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

// Link de WhatsApp con el mensaje de la tarjeta de lealtad precargado
// (ver app/lealtad/[code]/page.tsx) — el cajero lo abre y lo manda con
// un clic, no hay envío automático por API (fuera de alcance hasta que
// el negocio tenga una cuenta de WhatsApp Business API, ver
// docs/CONTINUE.md). `origin` viene de `window.location.origin` — esta
// función no toca `window` para poder importarse en cualquier lado.
// Regresa null si el teléfono no es utilizable (ver toWhatsAppNumber).
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
  const digits = toWhatsAppNumber(phone);
  if (!digits) return null;

  const cardUrl = `${origin}/lealtad/${loyaltyCardCode}`;
  const lines = [`¡Hola! Aquí está tu tarjeta de lealtad de Nomada Café: ${cardUrl}`];
  if (welcomeCouponCode) {
    lines.push(`Tienes un cupón de 10% para tu próxima compra — código ${welcomeCouponCode}.`);
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join(" "))}`;
}
