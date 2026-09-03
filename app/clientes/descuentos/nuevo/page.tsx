import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { Sidebar } from "@/components/layout/sidebar";
import { DiscountCodeForm } from "@/components/clientes/discount-code-form";

export default async function NuevoDescuentoPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "DESCUENTO_CODIGO_CREAR"))) {
    redirect("/clientes/descuentos");
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl p-6">
          <DiscountCodeForm employeeId={employee.id} />
        </div>
      </div>
    </div>
  );
}
