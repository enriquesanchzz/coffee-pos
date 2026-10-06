import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getPurchaseOrders } from "@/lib/purchases";
import { getInventoryOverview } from "@/lib/inventory";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { purchaseOrderStatusLabels } from "@/components/compras/enum-labels";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Compras" };

export default async function ComprasPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const [orders, inventory] = await Promise.all([getPurchaseOrders(), getInventoryOverview()]);
  const lowStockItems = inventory.filter((item) => item.isLow);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Compras</h1>
            <div className="flex gap-3">
              <Link href="/compras/proveedores" className="text-sm text-muted-foreground hover:underline">
                Proveedores →
              </Link>
              <Link href="/compras/transferencias" className="text-sm text-muted-foreground hover:underline">
                Transferencias →
              </Link>
              <Link href="/compras/conteos" className="text-sm text-muted-foreground hover:underline">
                Conteos físicos →
              </Link>
            </div>
          </div>
          <Link
            href="/compras/nueva"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Nueva orden
          </Link>
        </div>

        {lowStockItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Insumos con stock bajo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span>{item.name}</span>
                    <Badge variant="destructive" className="text-[10px]">
                      stock bajo
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Intl.NumberFormat("es-MX").format(item.quantity)} {item.baseUnit}
                    </span>
                    <Link href="/compras/nueva" className="text-sm text-primary hover:underline">
                      Pedir →
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <span>{formatCurrency(order.estimatedTotal)}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
