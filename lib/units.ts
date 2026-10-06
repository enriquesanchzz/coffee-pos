import { unitLabel } from "./utils";

// Conversiones estándar entre unidades de compra y de inventario. ESPRESSO
// _SHOT = 18 g de café (definido en el enum UnitOfMeasure del schema), así
// que 1 kg de café en grano = 1000 / 18 ≈ 55.56 shots.
const STANDARD_FACTORS: Record<string, number> = {
  "L>ML": 1000,
  "KG>G": 1000,
  "KG>ESPRESSO_SHOT": 1000 / 18,
};

export function standardFactor(fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return 1;
  return STANDARD_FACTORS[`${fromUnit}>${toUnit}`] ?? null;
}

// Presentación en la que se compra un insumo: "cuántas unidades base trae
// una unidad de compra". Prioridad:
//   1. Presentación explícita del insumo (ej. "Caja 12 L" = 12000 ml).
//   2. purchaseUnit con conversión estándar (ej. L → 1000 ml).
//   3. null: se compra en la misma unidad base.
export type PurchasePresentation = { name: string; size: number };

export function resolvePurchasePresentation(ingredient: {
  baseUnit: string;
  purchaseUnit: string;
  purchasePresentationName: string | null;
  purchasePresentationSize: number | null;
}): PurchasePresentation | null {
  if (ingredient.purchasePresentationName && ingredient.purchasePresentationSize) {
    return { name: ingredient.purchasePresentationName, size: ingredient.purchasePresentationSize };
  }
  const factor = standardFactor(ingredient.purchaseUnit, ingredient.baseUnit);
  if (factor && factor !== 1) {
    return { name: unitLabel(ingredient.purchaseUnit), size: factor };
  }
  return null;
}

// Redondeo para mostrar cantidades convertidas (ej. 2.5 cajas).
export function roundQty(value: number) {
  return Math.round(value * 10000) / 10000;
}
