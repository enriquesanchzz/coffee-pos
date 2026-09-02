import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getIngredientsWithTheoreticalStock } from "@/lib/counts";
import { Sidebar } from "@/components/layout/sidebar";
import { PhysicalCountForm } from "@/components/compras/physical-count-form";

export default async function NuevoConteoPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR"))) {
    redirect("/compras/conteos");
  }

  const ingredients = await getIngredientsWithTheoreticalStock();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <PhysicalCountForm employeeId={employee.id} ingredients={ingredients} />
      </div>
    </div>
  );
}
