import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import {
  getRecipeOverview,
  getProductCategories,
  getIngredientPickerOptions,
  getTargetFoodCostPercent,
} from "@/lib/recipes";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ProductosWorkspace } from "@/components/productos/productos-workspace";

export default async function ProductosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

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
