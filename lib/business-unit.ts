import type { BusinessUnit } from "@prisma/client";

// Unidad de negocio (ProductCategory.businessUnit): Cafetería o Pet Shop.
// Sin imports de servidor — lo usan también componentes de cliente.

export const BUSINESS_UNITS: BusinessUnit[] = ["CAFE", "PET_SHOP"];

export const BUSINESS_UNIT_LABELS: Record<BusinessUnit, string> = {
  CAFE: "Cafetería",
  PET_SHOP: "Pet Shop",
};

export function isBusinessUnit(value: unknown): value is BusinessUnit {
  return value === "CAFE" || value === "PET_SHOP";
}

// Reparte lo que de verdad se cobró de un ticket (después de descuentos,
// sin propina) entre las unidades, en proporción a sus líneas. Las líneas
// traen precio de lista; si el ticket tuvo un descuento general, cada
// unidad absorbe su parte. Centavos sobrantes van a la unidad con más peso
// para que la suma cuadre exacto con `paidTotal`.
export function allocateByUnit(
  lines: { unit: BusinessUnit; amount: number }[],
  paidTotal: number
): Record<BusinessUnit, number> {
  const gross: Record<BusinessUnit, number> = { CAFE: 0, PET_SHOP: 0 };
  for (const line of lines) gross[line.unit] += line.amount;
  const grossTotal = gross.CAFE + gross.PET_SHOP;
  if (grossTotal <= 0) return { CAFE: paidTotal, PET_SHOP: 0 };

  const cents = Math.round(paidTotal * 100);
  const result: Record<BusinessUnit, number> = { CAFE: 0, PET_SHOP: 0 };
  let assigned = 0;
  for (const unit of BUSINESS_UNITS) {
    const share = Math.floor((cents * gross[unit]) / grossTotal);
    result[unit] = share;
    assigned += share;
  }
  const heavier: BusinessUnit = gross.PET_SHOP > gross.CAFE ? "PET_SHOP" : "CAFE";
  result[heavier] += cents - assigned;
  return { CAFE: result.CAFE / 100, PET_SHOP: result.PET_SHOP / 100 };
}
