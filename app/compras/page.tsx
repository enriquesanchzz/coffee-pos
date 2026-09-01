import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getPurchaseOrders } from "@/lib/purchases";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { purchaseOrderStatusLabels } from "@/components/compras/enum-labels";

export default async function ComprasPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "COMPRA_REGISTRAR"));
  if (!canManage) redirect("/pos");

  const orders = await getPurchaseOrders();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Compras</h1>
              <Link href="/compras/proveedores" className="text-sm text-muted-foreground hover:underline">
                Proveedores →
              </Link>
            </div>
            <Link
              href="/compras/nueva"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Nueva orden
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Órdenes de compra</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {orders.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay órdenes.</p>
              )}
              {orders.map((order) => {
                const statusLabel =
                  purchaseOrderStatusLabels[order.status as keyof typeof purchaseOrderStatusLabels] ??
                  order.status;
                return (
                  <Link
                    key={order.id}
                    href={`/compras/${order.id}`}
                    className="flex items-center justify-between text-sm hover:underline"
                  >
                    <div>
                      <p>{order.supplierName}</p>
                      <p className="text-xs text-muted-foreground">
                        {statusLabel} · {order.itemCount} línea{order.itemCount === 1 ? "" : "s"} ·{" "}
                        {new Date(order.createdAt).toLocaleDateString("es-MX")}
                      </p>
                    </div>
                    <span>{formatCurrency(order.estimatedTotal)}</span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
