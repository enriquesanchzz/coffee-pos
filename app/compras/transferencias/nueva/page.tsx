import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getStockLocations } from "@/lib/transfers";
import { getIngredientOptions } from "@/lib/purchases";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ComprasLayout } from "@/components/compras/compras-layout";
import { NewTransferForm } from "@/components/compras/new-transfer-form";

export const metadata: Metadata = { title: "Nueva transferencia" };

export default async function NuevaTransferenciaPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR"))) {
    redirect("/compras/transferencias");
  }

  const [stockLocations, ingredients] = await Promise.all([
    getStockLocations(),
    getIngredientOptions(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <ComprasLayout>
        <NewTransferForm employeeId={employee.id} stockLocations={stockLocations} ingredients={ingredients} />
      </ComprasLayout>
    </AuthenticatedShell>
  );
}
