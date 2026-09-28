import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { SupplierForm } from "@/components/compras/supplier-form";

export default async function NuevoProveedorPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR"))) {
    redirect("/compras/proveedores");
  }

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <SupplierForm employeeId={employee.id} ingredientOptions={[]} />
    </AuthenticatedShell>
  );
}
