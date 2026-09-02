import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "./constants";

export type IngredientTheoreticalStock = {
  ingredientId: string;
  name: string;
  baseUnit: string;
  theoreticalQty: number;
};

// Stock teórico actual por ingrediente activo, para precargar el form de un
// conteo nuevo. Se lee en el momento del submit (no hay estado ABIERTO
// resumible en este pase — ver docs/CONTINUE.md).
export async function getIngredientsWithTheoreticalStock(): Promise<IngredientTheoreticalStock[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { stocks: { where: { stockLocationId: DEFAULT_STOCK_LOCATION_ID } } },
  });

  return ingredients.map((ingredient) => ({
    ingredientId: ingredient.id,
    name: ingredient.name,
    baseUnit: ingredient.baseUnit,
    theoreticalQty: ingredient.stocks[0]?.quantity.toNumber() ?? 0,
  }));
}

export type PhysicalCountListItem = {
  id: string;
  status: string;
  performedByName: string;
  startedAt: string;
  lineCount: number;
};

export async function getPhysicalCounts(): Promise<PhysicalCountListItem[]> {
  const counts = await prisma.physicalCount.findMany({
    where: { branchId: DEFAULT_BRANCH_ID },
    orderBy: { startedAt: "desc" },
    include: { performedBy: true, lines: true },
  });

  return counts.map((count) => ({
    id: count.id,
    status: count.status,
    performedByName: count.performedBy.name,
    startedAt: count.startedAt.toISOString(),
    lineCount: count.lines.length,
  }));
}

export type PhysicalCountLineDetail = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  theoreticalQty: number;
  physicalQty: number;
  unit: string;
};

export type PhysicalCountDetail = {
  id: string;
  status: string;
  performedById: string;
  performedByName: string;
  approvedByName: string | null;
  startedAt: string;
  closedAt: string | null;
  lines: PhysicalCountLineDetail[];
};

export async function getPhysicalCountDetail(id: string): Promise<PhysicalCountDetail> {
  const count = await prisma.physicalCount.findUniqueOrThrow({
    where: { id },
    include: {
      performedBy: true,
      approvedBy: true,
      lines: { include: { ingredient: true } },
    },
  });

  return {
    id: count.id,
    status: count.status,
    performedById: count.performedById,
    performedByName: count.performedBy.name,
    approvedByName: count.approvedBy?.name ?? null,
    startedAt: count.startedAt.toISOString(),
    closedAt: count.closedAt?.toISOString() ?? null,
    lines: count.lines.map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientName: line.ingredient.name,
      theoreticalQty: line.theoreticalQty.toNumber(),
      physicalQty: line.physicalQty.toNumber(),
      unit: line.unit,
    })),
  };
}
