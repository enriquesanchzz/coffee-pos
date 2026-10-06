import type { PaymentMethod } from "@prisma/client";

// Ajustes del sistema que antes estaban fijos en el código. Viven como
// columnas de Branch (sucursal única, DEFAULT_BRANCH_ID); lib/settings.ts
// los lee en el servidor y los componentes cliente los reciben como props.
// Este archivo no importa nada de servidor para poder usarse en ambos lados.

export const DEFAULT_BUSINESS_NAME = "Nomada Café";

export type ShortagePolicy = "CONFIRMAR" | "GERENTE" | "BLOQUEAR";
export type TaxMode = "NINGUNO" | "INCLUIDO";

export const SHORTAGE_POLICY_LABELS: Record<ShortagePolicy, string> = {
  CONFIRMAR: "Cualquier cajero puede confirmar la venta",
  GERENTE: "Solo gerente o administrador puede confirmar",
  BLOQUEAR: "No se permite vender sin insumos",
};

export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  NINGUNO: "No desglosar impuestos",
  INCLUIDO: "Precios con IVA incluido (se desglosa en el cobro)",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
};

export type BusinessSettings = {
  businessName: string;
  phone: string | null;
  address: string | null;
  timeZone: string;
  tipPercents: number[];
  highTipThresholdPercent: number;
  paymentMethods: PaymentMethod[];
  cashQuickBills: number[];
  shiftChangeHour: number;
  defaultOpeningCash: number;
  cashDifferenceTolerance: number;
  loyaltyStampsPerReward: number;
  welcomeCouponPercent: number;
  welcomeCouponValidDays: number | null;
  maxManualDiscountPercent: number | null;
  shortagePolicy: ShortagePolicy;
  pinMaxAttempts: number;
  pinLockMinutes: number;
  sessionHours: number;
  taxMode: TaxMode;
  taxRatePercent: number;
};

// Mismos valores que los @default del schema (y que el comportamiento
// anterior, cuando eran constantes).
export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: DEFAULT_BUSINESS_NAME,
  phone: null,
  address: null,
  timeZone: "America/Mexico_City",
  tipPercents: [10, 15, 20],
  highTipThresholdPercent: 50,
  paymentMethods: ["EFECTIVO", "TARJETA", "TRANSFERENCIA"],
  cashQuickBills: [20, 50, 100, 200, 500, 1000],
  shiftChangeHour: 14,
  defaultOpeningCash: 0,
  cashDifferenceTolerance: 0,
  loyaltyStampsPerReward: 5,
  welcomeCouponPercent: 10,
  welcomeCouponValidDays: null,
  maxManualDiscountPercent: null,
  shortagePolicy: "CONFIRMAR",
  pinMaxAttempts: 5,
  pinLockMinutes: 5,
  sessionHours: 12,
  taxMode: "NINGUNO",
  taxRatePercent: 16,
};

// IVA contenido en un total con impuesto incluido: total − total ÷ (1 + tasa).
export function includedTax(total: number, settings: Pick<BusinessSettings, "taxMode" | "taxRatePercent">) {
  if (settings.taxMode !== "INCLUIDO" || !(settings.taxRatePercent > 0)) return 0;
  const rate = settings.taxRatePercent / 100;
  return Math.round((total - total / (1 + rate)) * 100) / 100;
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Zonas más comunes para el selector (México primero).
export const COMMON_TIME_ZONES = [
  { value: "America/Mexico_City", label: "Centro (Ciudad de México, Guadalajara, Monterrey)" },
  { value: "America/Cancun", label: "Sureste (Cancún, Quintana Roo)" },
  { value: "America/Chihuahua", label: "Chihuahua" },
  { value: "America/Mazatlan", label: "Pacífico (Mazatlán, Sinaloa, Nayarit, BCS)" },
  { value: "America/Hermosillo", label: "Sonora (Hermosillo)" },
  { value: "America/Tijuana", label: "Noroeste (Tijuana, Baja California)" },
  { value: "America/Bogota", label: "Bogotá" },
  { value: "America/Lima", label: "Lima" },
  { value: "America/Santiago", label: "Santiago" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { value: "Europe/Madrid", label: "Madrid" },
];

export function tooManyAttemptsText(minutes: number) {
  return `Demasiados intentos fallidos. Espera ${minutes} minuto${minutes === 1 ? "" : "s"} antes de volver a intentar.`;
}
