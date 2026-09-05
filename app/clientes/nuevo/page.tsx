import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { Sidebar } from "@/components/layout/sidebar";
import { CustomerForm } from "@/components/clientes/customer-form";

export default async function NuevoClientePage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR"))) {
    redirect("/clientes");
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
          <h1 className="text-lg font-semibold">Nuevo cliente</h1>
          <CustomerForm employeeId={employee.id} />
        </div>
      </div>
    </div>
  );
}
