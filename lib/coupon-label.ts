import type { BusinessUnit, DiscountType, VariantTemperature } from "@prisma/client";
import { BUSINESS_UNIT_LABELS } from "./business-unit";

const TEMPERATURE_LABELS: Record<VariantTemperature, string> = {
  CALIENTE: "Caliente",
  FRIO: "Frío",
  FRAPPE: "Frappé",
};

// "Chico, Caliente": dos variantes de un producto pueden llamarse igual y
// distinguirse solo por la temperatura.
export function variantLabel(variant: { name: string; temperature: VariantTemperature | null }): string {
  return variant.temperature ? `${variant.name}, ${TEMPERATURE_LABELS[variant.temperature]}` : variant.name;
}

// Texto de un cupón para el cajero y el cliente, ej. "10% en Cafetería",
// "Latte (Chico, Frío) gratis", "5% en Pet Shop (permanente)". Lo comparten
// el POS, Códigos de descuento, el perfil del cliente y /lealtad.
export type CouponForLabel = {
  type: DiscountType;
  value: { toNumber(): number } | number;
  businessUnit: BusinessUnit | null;
  isReusable: boolean;
  productVariant: { name: string; temperature: VariantTemperature | null; product: { name: string } } | null;
};

export const COUPON_LABEL_INCLUDE = {
  productVariant: { select: { name: true, temperature: true, product: { select: { name: true } } } },
} as const;

export function couponLabel(code: CouponForLabel): string {
  if (code.productVariant) return `${code.productVariant.product.name} (${variantLabel(code.productVariant)}) gratis`;
  const value = typeof code.value === "number" ? code.value : code.value.toNumber();
  const amount =
    code.type === "PORCENTAJE" ? `${value}%` : code.type === "MONTO_FIJO" ? `$${value.toFixed(2)}` : `precio final $${value.toFixed(2)}`;
  const scope = code.businessUnit ? ` en ${BUSINESS_UNIT_LABELS[code.businessUnit]}` : "";
  return `${amount}${scope}${code.isReusable ? " (permanente)" : ""}`;
}
