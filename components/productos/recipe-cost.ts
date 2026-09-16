import type { IngredientOption, ComposedRecipeOption } from "@/lib/recipes";
import type { LineDraft } from "./recipe-lines-editor";

// Costo en vivo de las líneas de receta que se están editando — mismo
// criterio que calculateRecipeVersionCost (lib/recipe-cost.ts): sin
// conversión de unidad, $0 para un ingrediente sin costo cotizado
// todavía. Se calcula en el cliente (costPerUnit/currentCost ya vienen
// precargados por getIngredientPickerOptions) para no pedirle al
// servidor el costo en cada tecla.
export function computeLinesCost(
  lines: LineDraft[],
  ingredients: IngredientOption[],
  composedRecipes: ComposedRecipeOption[]
): number {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const composedById = new Map(composedRecipes.map((r) => [r.id, r]));

  let total = 0;
  for (const line of lines) {
    const [kind, refId] = line.ref.split(":");
    const quantity = Number(line.quantity) || 0;
    if (quantity <= 0) continue;

    if (kind === "ingredient") {
      const cost = ingredientById.get(refId)?.costPerUnit ?? 0;
      total += quantity * cost;
    } else if (kind === "composed") {
      const cost = composedById.get(refId)?.currentCost ?? 0;
      total += quantity * cost;
    }
  }
  return total;
}
