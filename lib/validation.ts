import { isValidEmail } from "./utils";

// Validaciones de datos de entrada compartidas por las Server Actions
// (QA-009). Lanzan Error con el mensaje para el usuario (ver safeAction).

// Teléfono de México: 10 dígitos, aceptando espacios, guiones, paréntesis
// y lada +52 opcional. Regresa los 10 dígitos normalizados.
export function normalizePhoneMx(phone: string | undefined | null, label = "El teléfono"): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+52")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("52")) digits = digits.slice(2);
  if (!/^\d{10}$/.test(digits)) {
    throw new Error(`${label} debe tener 10 dígitos (ej. 341 123 4567).`);
  }
  return digits;
}

export function normalizeEmail(email: string | undefined | null): string | null {
  const value = email?.trim().toLowerCase();
  if (!value) return null;
  if (!isValidEmail(value)) {
    throw new Error("El email no es válido.");
  }
  return value;
}

// Montos de dinero: no negativos y con un tope que atrape errores de
// captura (un precio de $99,999,999 o un mínimo de orden negativo).
export function assertMoney(value: number | null | undefined, label: string, { max = 50_000, allowZero = true } = {}) {
  if (value === null || value === undefined) return;
  if (Number.isNaN(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`${label} debe ser ${allowZero ? "mayor o igual a" : "mayor a"} cero.`);
  }
  if (value > max) {
    throw new Error(`${label} no puede ser mayor a $${max.toLocaleString("es-MX")}. Revisa el valor.`);
  }
}

// RFC mexicano: 12 dígitos (persona moral) o 13 (persona física). No se
// valida la homoclave de verdad (haría falta el algoritmo completo del
// SAT) — solo la forma, para atrapar errores de captura obvios.
export function normalizeRfc(rfc: string | undefined | null): string | null {
  const raw = rfc?.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!raw) return null;
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(raw)) {
    throw new Error("El RFC no tiene un formato válido (ej. XAXX010101000).");
  }
  return raw;
}

// URL de imagen: vacía o https:// (no hay storage de archivos propio).
export function normalizeImageUrl(url: string | undefined | null): string | null {
  const value = url?.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("La imagen debe ser un link que empiece con https://");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("La imagen debe ser un link que empiece con https://");
  }
  return value;
}
