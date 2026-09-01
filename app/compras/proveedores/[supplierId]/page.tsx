import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSupplierDetail, getIngredientOptions } from "@/lib/purchases";
import { Sidebar } from "@/components/layout/sidebar";
import { SupplierForm } from "@/components/compras/supplier-form";

export default async function EditarProveedorPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR"))) {
    redirect("/compras/proveedores");
  }

  const { supplierId } = await params;
  const [supplier, ingredientOptions] = await Promise.all([
    getSupplierDetail(supplierId),
    getIngredientOptions(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <SupplierForm employeeId={employee.id} supplier={supplier} ingredientOptions={ingredientOptions} />
      </div>
    </div>
  );
}
