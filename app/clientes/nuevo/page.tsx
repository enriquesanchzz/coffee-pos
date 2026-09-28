import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { CustomerForm } from "@/components/clientes/customer-form";

export default async function NuevoClientePage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR"))) {
    redirect("/clientes");
  }

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
          <h1 className="text-lg font-semibold">Nuevo cliente</h1>
          <CustomerForm employeeId={employee.id} />
        </div>
    </AuthenticatedShell>
  );
}
