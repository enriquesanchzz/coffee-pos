import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCombos, getPromotions, getVariantOptions } from "@/lib/promotions";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PromocionesWorkspace } from "@/components/promociones/promociones-workspace";

export const metadata: Metadata = { title: "Promociones" };

export default async function PromocionesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "PROMOCION_GESTIONAR"))) {
    redirect("/administracion");
  }

  const [combos, promotions, variants] = await Promise.all([getCombos(), getPromotions(), getVariantOptions()]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <PromocionesWorkspace combos={combos} promotions={promotions} variants={variants} employeeId={employee.id} />
    </AuthenticatedShell>
  );
}
