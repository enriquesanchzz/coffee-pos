import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { requireAdminPage } from "@/lib/admin-page";
import {
  getPurchaseOrderDetail,
  getActiveSuppliers,
  getIngredientOptions,
  getSupplierCostMap,
} from "@/lib/purchases";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ComprasLayout } from "@/components/compras/compras-layout";
import { PurchaseOrderDetailView } from "@/components/compras/purchase-order-detail-view";
import { orNotFound } from "@/lib/not-found";

export const metadata: Metadata = { title: "Orden de compra" };

export default async function DetalleOrdenPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const employee = await requireAdminPage("/compras");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "COMPRA_REGISTRAR"));
  if (!canManage) redirect("/pos");

  const { purchaseOrderId } = await params;
  const [order, suppliers, ingredients, supplierCostsBySupplier] = await Promise.all([
    orNotFound(getPurchaseOrderDetail(purchaseOrderId)),
    getActiveSuppliers(),
    getIngredientOptions(),
    getSupplierCostMap(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <ComprasLayout>
      <PurchaseOrderDetailView
        employeeId={employee.id}
        order={order}
        suppliers={suppliers}
        ingredients={ingredients}
        supplierCostsBySupplier={supplierCostsBySupplier}
      />
      </ComprasLayout>
    </AuthenticatedShell>
  );
}
