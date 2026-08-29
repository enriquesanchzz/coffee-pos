import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getInventoryOverview } from "@/lib/inventory";
import { Sidebar } from "@/components/layout/sidebar";
import { InventoryOverview } from "@/components/inventario/inventory-overview";

export default async function InventarioPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_CONSULTAR"))) {
    redirect("/pos");
  }

  const items = await getInventoryOverview();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <InventoryOverview items={items} employeeId={employee.id} />
      </div>
    </div>
  );
}
