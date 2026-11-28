import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-page";
import {
  getRecipeOverview,
  getProductCategories,
  getIngredientPickerOptions,
  getTargetFoodCostPercent,
} from "@/lib/recipes";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ProductosWorkspace } from "@/components/productos/productos-workspace";

export const metadata: Metadata = { title: "Productos" };

export default async function ProductosPage() {
  const employee = await requireAdminPage("/productos");

  const [products, categories, ingredientOptions, targetFoodCostPercent] = await Promise.all([
    getRecipeOverview(),
    getProductCategories(),
    getIngredientPickerOptions(),
    getTargetFoodCostPercent(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <ProductosWorkspace
        products={products}
        categories={categories}
        ingredientOptions={ingredientOptions}
        targetFoodCostPercent={targetFoodCostPercent}
        employeeId={employee.id}
      />
    </AuthenticatedShell>
  );
}
