import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getRoles, getEmployeeDetail } from "@/lib/employees";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { EmployeeForm } from "@/components/empleados/employee-form";
import { orNotFound } from "@/lib/not-found";

export const metadata: Metadata = { title: "Editar empleado" };

export default async function EditarEmpleadoPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const { employeeId } = await params;
  const [roles, employee] = await Promise.all([getRoles(), orNotFound(getEmployeeDetail(employeeId))]);

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name}>
      <EmployeeForm roles={roles} employee={employee} currentEmployeeId={actor.id} />
    </AuthenticatedShell>
  );
}
