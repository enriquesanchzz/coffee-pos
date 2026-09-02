import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "./constants";
import { calculateRecipeVersionCost } from "./recipe-cost";

// Resuelve el rango de fechas de ?from=&to= en la URL, con default de los
// últimos 30 días. `to` se extiende al final del día para incluir todas las
// ventas/movimientos de esa fecha.
export function resolveDateRange(fromParam?: string, toParam?: string) {
  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const defaultFromDate = new Date(now);
  defaultFromDate.setDate(defaultFromDate.getDate() - 30);
  const defaultFrom = defaultFromDate.toISOString().slice(0, 10);

  const fromStr = fromParam || defaultFrom;
  const toStr = toParam || defaultTo;

  return {
    from: new Date(`${fromStr}T00:00:00`),
    to: new Date(`${toStr}T23:59:59.999`),
    fromStr,
    toStr,
  };
}

// -----------------------------------------------------------------------
// Reporte de utilidad: por cada línea de venta, costo = costo de su receta
// (calculado con el costo ACTUAL de los ingredientes aplicado a la
// composición histórica exacta vía SaleItem.recipeVersionId) + costo de
// los modificadores que consumen ingrediente propio (ej. "Shot extra").
// No cruza IngredientCostHistory por fecha — ver limitación documentada en
// docs/CONTINUE.md.
// -----------------------------------------------------------------------

export type ProfitReportLine = {
  productVariantId: string;
  productName: string;
  variantName: string;
  quantitySold: number;
  revenue: number;
  cogs: number;
  margin: number;
  marginPct: number;
};

export type ProfitReport = {
  revenue: number;
  cogs: number;
  margin: number;
  marginPct: number;
  lines: ProfitReportLine[];
};

export async function getProfitReport(from: Date, to: Date): Promise<ProfitReport> {
  const sales = await prisma.sale.findMany({
    where: { branchId: DEFAULT_BRANCH_ID, status: "COMPLETADA", createdAt: { gte: from, lte: to } },
    include: {
      items: {
        include: {
          productVariant: { include: { product: true } },
          modifiers: { include: { modifierOption: true } },
        },
      },
    },
  });

  let totalRevenue = new Prisma.Decimal(0);
  let totalCogs = new Prisma.Decimal(0);
  const costCache = new Map<string, Prisma.Decimal>();
  const byVariant = new Map<
    string,
    { productName: string; variantName: string; quantitySold: number; revenue: Prisma.Decimal; cogs: Prisma.Decimal }
  >();

  for (const sale of sales) {
    totalRevenue = totalRevenue.add(sale.total);

    for (const item of sale.items) {
      let itemCogs = new Prisma.Decimal(0);

      if (item.recipeVersionId) {
        let unitCost = costCache.get(item.recipeVersionId);
        if (!unitCost) {
          unitCost = await calculateRecipeVersionCost(prisma, item.recipeVersionId);
          costCache.set(item.recipeVersionId, unitCost);
        }
        itemCogs = itemCogs.add(unitCost.mul(item.quantity));
      }

      for (const modifier of item.modifiers) {
        const option = modifier.modifierOption;
        if (option.ingredientId && option.quantityDelta) {
          const supplierCost = await prisma.ingredientSupplier.findFirst({
            where: { ingredientId: option.ingredientId, isSelected: true },
          });
          if (supplierCost) {
            itemCogs = itemCogs.add(option.quantityDelta.mul(supplierCost.cost).mul(item.quantity));
          }
        }
      }

      totalCogs = totalCogs.add(itemCogs);

      if (item.productVariantId && item.productVariant) {
        const existing = byVariant.get(item.productVariantId) ?? {
          productName: item.productVariant.product.name,
          variantName: item.productVariant.name,
          quantitySold: 0,
          revenue: new Prisma.Decimal(0),
          cogs: new Prisma.Decimal(0),
        };
        existing.quantitySold += item.quantity;
        existing.revenue = existing.revenue.add(item.lineTotal);
        existing.cogs = existing.cogs.add(itemCogs);
        byVariant.set(item.productVariantId, existing);
      }
    }
  }

  const lines: ProfitReportLine[] = Array.from(byVariant.entries())
    .map(([productVariantId, v]) => {
      const margin = v.revenue.sub(v.cogs);
      return {
        productVariantId,
        productName: v.productName,
        variantName: v.variantName,
        quantitySold: v.quantitySold,
        revenue: v.revenue.toNumber(),
        cogs: v.cogs.toNumber(),
        margin: margin.toNumber(),
        marginPct: v.revenue.isZero() ? 0 : margin.div(v.revenue).mul(100).toNumber(),
      };
    })
    .sort((a, b) => b.margin - a.margin);

  const totalMargin = totalRevenue.sub(totalCogs);

  return {
    revenue: totalRevenue.toNumber(),
    cogs: totalCogs.toNumber(),
    margin: totalMargin.toNumber(),
    marginPct: totalRevenue.isZero() ? 0 : totalMargin.div(totalRevenue).mul(100).toNumber(),
    lines,
  };
}

// -----------------------------------------------------------------------
// Reporte de inventario: valor de stock actual + movimientos del periodo
// agrupados por tipo.
// -----------------------------------------------------------------------

export type InventoryValueItem = {
  ingredientId: string;
  name: string;
  category: string;
  baseUnit: string;
  quantity: number;
  unitCost: number;
  value: number;
};

export type MovementSummary = {
  type: string;
  totalQuantity: number;
  count: number;
};

export type InventoryReport = {
  items: InventoryValueItem[];
  totalValue: number;
  movementSummary: MovementSummary[];
};

export async function getInventoryReport(from: Date, to: Date): Promise<InventoryReport> {
  const ingredients = await prisma.ingredient.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      stocks: { where: { stockLocationId: DEFAULT_STOCK_LOCATION_ID } },
      suppliers: { where: { isSelected: true }, take: 1 },
    },
  });

  const items: InventoryValueItem[] = ingredients.map((ingredient) => {
    const quantity = ingredient.stocks[0]?.quantity.toNumber() ?? 0;
    const unitCost = ingredient.suppliers[0]?.cost.toNumber() ?? 0;
    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      category: ingredient.category,
      baseUnit: ingredient.baseUnit,
      quantity,
      unitCost,
      value: quantity * unitCost,
    };
  });

  const totalValue = items.reduce((sum, item) => sum + item.value, 0);

  const movements = await prisma.inventoryMovement.groupBy({
    by: ["type"],
    where: { stockLocationId: DEFAULT_STOCK_LOCATION_ID, createdAt: { gte: from, lte: to } },
    _sum: { quantity: true },
    _count: { _all: true },
  });

  const movementSummary: MovementSummary[] = movements.map((movement) => ({
    type: movement.type,
    totalQuantity: movement._sum.quantity?.toNumber() ?? 0,
    count: movement._count._all,
  }));

  return { items, totalValue, movementSummary };
}

// -----------------------------------------------------------------------
// Reporte de recetas: costo actual vs. precio por variante activa, y el
// historial de RecipeCostHistory de cada una (vacío hasta que se edite esa
// receta después de este cambio — no hay backfill de recetas sembradas).
// -----------------------------------------------------------------------

export type RecipeCostHistoryEntry = {
  id: string;
  totalCost: number;
  recordedAt: string;
  reason: string | null;
};

export type RecipeCostReportItem = {
  variantId: string;
  productName: string;
  variantName: string;
  price: number;
  currentCost: number;
  margin: number;
  marginPct: number;
  history: RecipeCostHistoryEntry[];
};

export async function getRecipeCostReport(): Promise<RecipeCostReportItem[]> {
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, product: { type: "RECETA" } },
    orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
    include: {
      product: true,
      recipes: {
        where: { kind: "PRODUCTO_VENDIBLE" },
        include: {
          versions: {
            where: { isActive: true },
            take: 1,
            include: { costHistory: { orderBy: { recordedAt: "desc" } } },
          },
        },
      },
    },
  });

  const result: RecipeCostReportItem[] = [];

  for (const variant of variants) {
    const version = variant.recipes[0]?.versions[0];
    if (!version) continue;

    const currentCost = await calculateRecipeVersionCost(prisma, version.id);
    const margin = variant.price.sub(currentCost);

    result.push({
      variantId: variant.id,
      productName: variant.product.name,
      variantName: variant.name,
      price: variant.price.toNumber(),
      currentCost: currentCost.toNumber(),
      margin: margin.toNumber(),
      marginPct: variant.price.isZero() ? 0 : margin.div(variant.price).mul(100).toNumber(),
      history: version.costHistory.map((entry) => ({
        id: entry.id,
        totalCost: entry.totalCost.toNumber(),
        recordedAt: entry.recordedAt.toISOString(),
        reason: entry.reason,
      })),
    });
  }

  return result;
}

// -----------------------------------------------------------------------
// Estadísticas: productos más vendidos, ventas por día, ticket promedio.
// -----------------------------------------------------------------------

export type TopProductStat = {
  productName: string;
  variantName: string;
  quantitySold: number;
  revenue: number;
};

export type DailySalesStat = {
  date: string;
  salesCount: number;
  revenue: number;
};

export type StatsReport = {
  totalSales: number;
  totalRevenue: number;
  averageTicket: number;
  topProducts: TopProductStat[];
  dailySales: DailySalesStat[];
};

export async function getStatsReport(from: Date, to: Date): Promise<StatsReport> {
  const sales = await prisma.sale.findMany({
    where: { branchId: DEFAULT_BRANCH_ID, status: "COMPLETADA", createdAt: { gte: from, lte: to } },
    include: { items: { include: { productVariant: { include: { product: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  const totalSales = sales.length;
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total.toNumber(), 0);
  const averageTicket = totalSales === 0 ? 0 : totalRevenue / totalSales;

  const byVariant = new Map<string, TopProductStat>();
  const byDay = new Map<string, { salesCount: number; revenue: number }>();

  for (const sale of sales) {
    const day = sale.createdAt.toISOString().slice(0, 10);
    const dayEntry = byDay.get(day) ?? { salesCount: 0, revenue: 0 };
    dayEntry.salesCount += 1;
    dayEntry.revenue += sale.total.toNumber();
    byDay.set(day, dayEntry);

    for (const item of sale.items) {
      if (!item.productVariantId || !item.productVariant) continue;
      const entry = byVariant.get(item.productVariantId) ?? {
        productName: item.productVariant.product.name,
        variantName: item.productVariant.name,
        quantitySold: 0,
        revenue: 0,
      };
      entry.quantitySold += item.quantity;
      entry.revenue += item.lineTotal.toNumber();
      byVariant.set(item.productVariantId, entry);
    }
  }

  const topProducts = Array.from(byVariant.values())
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);
  const dailySales = Array.from(byDay.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { totalSales, totalRevenue, averageTicket, topProducts, dailySales };
}
