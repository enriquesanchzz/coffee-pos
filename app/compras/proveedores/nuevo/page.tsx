import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { Sidebar } from "@/components/layout/sidebar";
import { SupplierForm } from "@/components/compras/supplier-form";

export default async function NuevoProveedorPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR"))) {
    redirect("/compras/proveedores");
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <SupplierForm employeeId={employee.id} ingredientOptions={[]} />
      </div>
    </div>
  );
}
