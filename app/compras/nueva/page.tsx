import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getActiveSuppliers, getIngredientOptions, getSupplierCostMap } from "@/lib/purchases";
import { Sidebar } from "@/components/layout/sidebar";
import { NewOrderForm } from "@/components/compras/new-order-form";

export default async function NuevaOrdenPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR"))) {
    redirect("/compras");
  }

  const [suppliers, ingredients, supplierCostsBySupplier] = await Promise.all([
    getActiveSuppliers(),
    getIngredientOptions(),
    getSupplierCostMap(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        {suppliers.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col gap-2 p-6">
            <p className="text-sm text-muted-foreground">
              Todavía no hay proveedores activos — crea uno antes de armar una orden.
            </p>
            <Link href="/compras/proveedores/nuevo" className="text-sm text-primary hover:underline">
              + Nuevo proveedor
            </Link>
          </div>
        ) : (
          <NewOrderForm
            employeeId={employee.id}
            suppliers={suppliers}
            ingredients={ingredients}
            supplierCostsBySupplier={supplierCostsBySupplier}
          />
        )}
      </div>
    </div>
  );
}
