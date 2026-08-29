import type { IngredientCategory, UnitOfMeasure } from "@prisma/client";

export const categoryLabels: Record<IngredientCategory, string> = {
  CAFE: "Café",
  JARABES: "Jarabes",
  LECHE: "Leche",
  TOPPINGS: "Toppings",
  INSUMOS: "Insumos",
};

export const unitLabels: Record<UnitOfMeasure, string> = {
  KG: "kg",
  G: "g",
  L: "L",
  ML: "ml",
  PUMP: "pump",
  PIEZA: "pza",
  CUCHARADA: "cda",
  ESPRESSO_SHOT: "shot",
};
