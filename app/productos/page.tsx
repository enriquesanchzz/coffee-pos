import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import {
  getRecipeOverview,
  getProductCategories,
  getIngredientPickerOptions,
  getTargetFoodCostPercent,
} from "@/lib/recipes";
import { Sidebar } from "@/components/layout/sidebar";
import { ProductosWorkspace } from "@/components/productos/productos-workspace";

export default async function ProductosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const [products, categories, ingredientOptions, targetFoodCostPercent] = await Promise.all([
    getRecipeOverview(),
    getProductCategories(),
    getIngredientPickerOptions(),
    getTargetFoodCostPercent(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <ProductosWorkspace
          products={products}
          categories={categories}
          ingredientOptions={ingredientOptions}
          targetFoodCostPercent={targetFoodCostPercent}
          employeeId={employee.id}
        />
      </div>
    </div>
  );
}
