import "server-only";
import { Prisma } from "@prisma/client";

// Costo recursivo de una RecipeVersion — mismo patrón que
// resolveRecipeConsumption en actions/pos.ts, pero para costo en vez de
// consumo de inventario. Un ingrediente atómico sin costo cotizado
// (ningún IngredientSupplier con isSelected=true) cuenta como $0 en vez de
// lanzar error — un costo desconocido no debe bloquear la venta ni el
// reporte, solo hacer que el margen calculado sea optimista para ese
// ingrediente hasta que alguien lo cotice en Compras.
export async function calculateRecipeVersionCost(
  tx: Prisma.TransactionClient,
  recipeVersionId: string,
  depth = 0
): Promise<Prisma.Decimal> {
  if (depth > 10) {
    throw new Error(
      "Profundidad máxima de receta compuesta excedida — posible ciclo entre recetas."
    );
  }

  const lines = await tx.recipeIngredient.findMany({ where: { recipeVersionId } });
  let total = new Prisma.Decimal(0);

  for (const line of lines) {
    if (line.ingredientId) {
      const supplierCost = await tx.ingredientSupplier.findFirst({
        where: { ingredientId: line.ingredientId, isSelected: true },
      });
      if (supplierCost) {
        total = total.add(line.quantity.mul(supplierCost.cost));
      }
    } else if (line.composedRecipeId) {
      const composedVersion = await tx.recipeVersion.findFirst({
        where: { recipeId: line.composedRecipeId, isActive: true },
      });
      if (composedVersion) {
        const composedCost = await calculateRecipeVersionCost(tx, composedVersion.id, depth + 1);
        total = total.add(line.quantity.mul(composedCost));
      }
    }
  }

  return total;
}

// Snapshot persistido — se llama al crear cada RecipeVersion nueva (ver
// actions/recipes.ts). El costo "actual" que se muestra en pantalla
// (lib/reports.ts) se calcula en vivo con calculateRecipeVersionCost
// directamente, sin depender de que exista un snapshot.
export async function recordRecipeCostSnapshot(
  tx: Prisma.TransactionClient,
  recipeVersionId: string,
  reason: string
): Promise<Prisma.Decimal> {
  const totalCost = await calculateRecipeVersionCost(tx, recipeVersionId);
  await tx.recipeCostHistory.create({
    data: { recipeVersionId, totalCost, reason },
  });
  return totalCost;
}
