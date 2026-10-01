import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCombos, getPromotions, getVariantOptions } from "@/lib/promotions";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PromocionesWorkspace } from "@/components/promociones/promociones-workspace";

export default async function PromocionesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "PROMOCION_GESTIONAR"))) {
    redirect("/administracion");
  }

  const [combos, promotions, variants] = await Promise.all([getCombos(), getPromotions(), getVariantOptions()]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Promociones</h1>
          <p className="text-sm text-muted-foreground">
            Paquetes precio reducido, 2x1 y días temáticos — se aplican solos en el POS.
          </p>
        </div>

        <PromocionesWorkspace combos={combos} promotions={promotions} variants={variants} employeeId={employee.id} />
      </div>
    </AuthenticatedShell>
  );
}
