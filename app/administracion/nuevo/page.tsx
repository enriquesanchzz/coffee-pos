import { redirect } from "next/navigation";
import { requirePasswordSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getRoles } from "@/lib/employees";
import { Sidebar } from "@/components/layout/sidebar";
import { EmployeeForm } from "@/components/administracion/employee-form";

export default async function NuevoEmpleadoPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (!(await hasPermission(actor.id, DEFAULT_BRANCH_ID, "EMPLEADO_CREAR"))) {
    redirect("/administracion");
  }

  const roles = await getRoles();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <EmployeeForm roles={roles} />
      </div>
    </div>
  );
}
