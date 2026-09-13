import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getProductCategories, getIngredientPickerOptions } from "@/lib/recipes";
import { Sidebar } from "@/components/layout/sidebar";
import { NewProductForm } from "@/components/productos/new-product-form";

export default async function NuevoProductoPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const [categories, ingredientOptions] = await Promise.all([
    getProductCategories(),
    getIngredientPickerOptions(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <NewProductForm
          categories={categories}
          ingredientOptions={ingredientOptions}
          employeeId={employee.id}
        />
      </div>
    </div>
  );
}
