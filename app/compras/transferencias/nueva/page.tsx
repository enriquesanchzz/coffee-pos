import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getStockLocations } from "@/lib/transfers";
import { getIngredientOptions } from "@/lib/purchases";
import { Sidebar } from "@/components/layout/sidebar";
import { NewTransferForm } from "@/components/compras/new-transfer-form";

export default async function NuevaTransferenciaPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR"))) {
    redirect("/compras/transferencias");
  }

  const [stockLocations, ingredients] = await Promise.all([
    getStockLocations(),
    getIngredientOptions(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <NewTransferForm employeeId={employee.id} stockLocations={stockLocations} ingredients={ingredients} />
      </div>
    </div>
  );
}
