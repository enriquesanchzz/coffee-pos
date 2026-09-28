import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import {
  getPurchaseOrderDetail,
  getActiveSuppliers,
  getIngredientOptions,
  getSupplierCostMap,
} from "@/lib/purchases";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PurchaseOrderDetailView } from "@/components/compras/purchase-order-detail-view";

export default async function DetalleOrdenPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "COMPRA_REGISTRAR"));
  if (!canManage) redirect("/pos");

  const { purchaseOrderId } = await params;
  const [order, suppliers, ingredients, supplierCostsBySupplier] = await Promise.all([
    getPurchaseOrderDetail(purchaseOrderId),
    getActiveSuppliers(),
    getIngredientOptions(),
    getSupplierCostMap(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <PurchaseOrderDetailView
        employeeId={employee.id}
        order={order}
        suppliers={suppliers}
        ingredients={ingredients}
        supplierCostsBySupplier={supplierCostsBySupplier}
      />
    </AuthenticatedShell>
  );
}
