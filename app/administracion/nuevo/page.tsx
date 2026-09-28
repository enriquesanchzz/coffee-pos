import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getRoles } from "@/lib/employees";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { EmployeeForm } from "@/components/administracion/employee-form";

export default async function NuevoEmpleadoPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const roles = await getRoles();

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name}>
      <EmployeeForm roles={roles} />
    </AuthenticatedShell>
  );
}
