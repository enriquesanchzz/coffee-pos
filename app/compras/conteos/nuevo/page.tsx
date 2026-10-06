import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getIngredientsWithTheoreticalStock } from "@/lib/counts";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PhysicalCountForm } from "@/components/compras/physical-count-form";

export const metadata: Metadata = { title: "Nuevo conteo físico" };

export default async function NuevoConteoPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR"))) {
    redirect("/compras/conteos");
  }

  const ingredients = await getIngredientsWithTheoreticalStock();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <PhysicalCountForm employeeId={employee.id} ingredients={ingredients} />
    </AuthenticatedShell>
  );
}
