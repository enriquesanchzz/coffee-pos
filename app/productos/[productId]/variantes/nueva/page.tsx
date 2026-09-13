import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getProductBasicInfo, getIngredientPickerOptions } from "@/lib/recipes";
import { Sidebar } from "@/components/layout/sidebar";
import { AddVariantForm } from "@/components/productos/add-variant-form";

export default async function NuevaVariantePage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const { productId } = await params;
  const [product, ingredientOptions] = await Promise.all([
    getProductBasicInfo(productId),
    getIngredientPickerOptions(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <AddVariantForm
          product={product}
          ingredientOptions={ingredientOptions}
          employeeId={employee.id}
        />
      </div>
    </div>
  );
}
