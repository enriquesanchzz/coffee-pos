"use client";

import { useState } from "react";
import type { PurchaseOrderDetail, ActiveSupplierOption, IngredientOption } from "@/lib/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { ReceiveOrderForm } from "./receive-order-form";
import { NewOrderForm } from "./new-order-form";
import { CancelOrderButton } from "./cancel-order-button";
import { purchaseOrderStatusLabels, unitLabels } from "./enum-labels";
import { formatDateTime } from "@/lib/time";

export function PurchaseOrderDetailView({
  employeeId,
  order,
  suppliers,
  ingredients,
  supplierCostsBySupplier,
}: {
  employeeId: string;
  order: PurchaseOrderDetail;
  suppliers: ActiveSupplierOption[];
  ingredients: IngredientOption[];
  supplierCostsBySupplier: Record<string, Record<string, number>>;
}) {
  const [editing, setEditing] = useState(false);
  const statusLabel =
    purchaseOrderStatusLabels[order.status as keyof typeof purchaseOrderStatusLabels] ?? order.status;
  const canEditOrCancel = order.status === "CREADA";

  if (editing) {
    return (
      <NewOrderForm
        employeeId={employeeId}
        suppliers={suppliers}
        ingredients={ingredients}
        supplierCostsBySupplier={supplierCostsBySupplier}
        existingOrder={order}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Orden — {order.supplierName}</h1>
          <p className="text-sm text-muted-foreground">
            {statusLabel} · creada {formatDateTime(order.createdAt)}
          </p>
        </div>
        {canEditOrCancel && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <CancelOrderButton employeeId={employeeId} purchaseOrderId={order.id} />
          </div>
        )}
      </div>

      {order.status === "CREADA" || order.status === "PROVEIDA_PARCIALMENTE" ? (
        // key por el set de ids de línea: editar una orden (updatePurchaseOrder)
        // borra y recrea sus PurchaseOrderItem con ids nuevos. La
        // revalidación automática de Next tras un Server Action puede
        // entregarle a este componente ya montado un `order` con ids
        // nuevos sin remontarlo, dejando su estado interno (`lines`,
        // inicializado una sola vez) apuntando a ids que ya no existen —
        // mismo patrón que el bug de CategoryDrilldown en Inventario,
        // mismo arreglo: forzar remount con un key atado a los datos que
        // cambian.
        <ReceiveOrderForm
          key={order.items.map((item) => item.id).join(",")}
          employeeId={employeeId}
          order={order}
        />
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
                  <span>{formatCurrency(item.actualUnitCost ?? item.estimatedUnitCost)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
