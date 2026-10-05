import { prisma } from "./prisma";
import { DEFAULT_STOCK_LOCATION_ID } from "./constants";

export type IngredientCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
};

export async function getIngredientCategories(): Promise<IngredientCategoryOption[]> {
  return prisma.ingredientCategory.findMany({ orderBy: { name: "asc" } });
}

export type InventoryOverviewItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  baseUnit: string;
  purchaseUnit: string;
  tracksExpiration: boolean;
  // Precio al cliente como extra libre en el POS, por unidad de dosis
  // estándar (o baseUnit) — ver Ingredient.extraUnitPrice.
  extraUnitPrice: number | null;
  extraPriceUnit: string;
  // Presentación de compra explícita (ej. "Caja 12 L" = 12000 ml).
  purchasePresentationName: string | null;
  purchasePresentationSize: number | null;
  quantity: number;
  reorderThreshold: number | null;
  isLow: boolean;
};

// Existencias actuales por ingrediente activo en una ubicación de stock.
// `reorderThreshold` viene de ReorderPoint cuando existe (no hay seed para
// esto todavía, por lo que puede venir null) — se usa solo para resaltar
// "stock bajo" en la UI, no bloquea nada.
export async function getInventoryOverview(
  stockLocationId: string = DEFAULT_STOCK_LOCATION_ID
): Promise<InventoryOverviewItem[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { isActive: true },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    include: {
      category: true,
      stocks: { where: { stockLocationId } },
      reorderPoints: { where: { stockLocationId } },
    },
  });

  return ingredients.map((ingredient) => {
    const quantity = ingredient.stocks[0]?.quantity.toNumber() ?? 0;
    const reorderThreshold = ingredient.reorderPoints[0]?.manualThreshold.toNumber() ?? null;

    return {
      id: ingredient.id,
      name: ingredient.name,
      categoryId: ingredient.categoryId,
      categoryName: ingredient.category.name,
      baseUnit: ingredient.baseUnit,
      purchaseUnit: ingredient.purchaseUnit,
      tracksExpiration: ingredient.tracksExpiration,
      extraUnitPrice: ingredient.extraUnitPrice?.toNumber() ?? null,
      extraPriceUnit: ingredient.standardDoseUnit ?? ingredient.baseUnit,
      purchasePresentationName: ingredient.purchasePresentationName,
      purchasePresentationSize: ingredient.purchasePresentationSize?.toNumber() ?? null,
      quantity,
      reorderThreshold,
      // Sin stock (o en negativo, posible si se vendió confirmando la
      // advertencia de insumos insuficientes) siempre cuenta como alerta,
      // aunque no haya ReorderPoint configurado (QA-003).
      isLow: quantity <= 0 || (reorderThreshold !== null && quantity <= reorderThreshold),
    };
  });
}
