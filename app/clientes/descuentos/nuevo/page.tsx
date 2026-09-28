import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { DiscountCodeForm } from "@/components/clientes/discount-code-form";

export default async function NuevoDescuentoPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "DESCUENTO_CODIGO_CREAR"))) {
    redirect("/clientes/descuentos");
  }

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto max-w-xl p-6">
          <DiscountCodeForm employeeId={employee.id} />
        </div>
    </AuthenticatedShell>
  );
}
