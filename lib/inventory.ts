import { prisma } from "./prisma";
import { DEFAULT_STOCK_LOCATION_ID } from "./constants";

export type InventoryOverviewItem = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
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
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
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
      category: ingredient.category,
      baseUnit: ingredient.baseUnit,
      quantity,
      reorderThreshold,
      isLow: reorderThreshold !== null && quantity <= reorderThreshold,
    };
  });
}
