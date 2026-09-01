import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getPurchaseOrderDetail } from "@/lib/purchases";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ReceiveOrderForm } from "@/components/compras/receive-order-form";
import { purchaseOrderStatusLabels, unitLabels } from "@/components/compras/enum-labels";

export default async function DetalleOrdenPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "COMPRA_REGISTRAR"));
  if (!canManage) redirect("/pos");

  const { purchaseOrderId } = await params;
  const order = await getPurchaseOrderDetail(purchaseOrderId);
  const statusLabel =
    purchaseOrderStatusLabels[order.status as keyof typeof purchaseOrderStatusLabels] ?? order.status;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">Orden — {order.supplierName}</h1>
            <p className="text-sm text-muted-foreground">
              {statusLabel} · creada {new Date(order.createdAt).toLocaleString("es-MX")}
            </p>
          </div>

          {order.status === "CREADA" ? (
            <ReceiveOrderForm employeeId={employee.id} order={order} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Líneas</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {order.items.map((item) => {
                  const unitLabel = unitLabels[item.unit as keyof typeof unitLabels] ?? item.unit;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0"
                    >
                      <div>
                        <p>{item.ingredientName}</p>
                        <p className="text-xs text-muted-foreground">
                          pedido {item.orderedQuantity} {unitLabel} · recibido {item.receivedQuantity ?? 0}{" "}
                          {unitLabel}
                        </p>
                      </div>
                      <span>
                        {formatCurrency(item.actualUnitCost ?? item.estimatedUnitCost)}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
