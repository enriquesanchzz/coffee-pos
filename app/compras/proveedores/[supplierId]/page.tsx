import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSupplierDetail, getIngredientOptions } from "@/lib/purchases";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ComprasLayout } from "@/components/compras/compras-layout";
import { SupplierForm } from "@/components/compras/supplier-form";
import { orNotFound } from "@/lib/not-found";

export const metadata: Metadata = { title: "Proveedor" };

export default async function EditarProveedorPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR"))) {
    redirect("/compras/proveedores");
  }

  const { supplierId } = await params;
  const [supplier, ingredientOptions] = await Promise.all([
    orNotFound(getSupplierDetail(supplierId)),
    getIngredientOptions(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <ComprasLayout>
        <SupplierForm employeeId={employee.id} supplier={supplier} ingredientOptions={ingredientOptions} />
      </ComprasLayout>
    </AuthenticatedShell>
  );
}
