import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getVariantRecipeDetail, getIngredientPickerOptions } from "@/lib/recipes";
import { Sidebar } from "@/components/layout/sidebar";
import { EditRecipeForm } from "@/components/recetas/edit-recipe-form";

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ variantId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const { variantId } = await params;
  const [detail, ingredientOptions] = await Promise.all([
    getVariantRecipeDetail(variantId),
    getIngredientPickerOptions(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <EditRecipeForm
          detail={detail}
          ingredientOptions={ingredientOptions}
          employeeId={employee.id}
        />
      </div>
    </div>
  );
}
