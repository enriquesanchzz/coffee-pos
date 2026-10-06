"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseOrderDetail } from "@/lib/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatUnitCost } from "@/lib/utils";
import { roundQty } from "@/lib/units";
import { receivePurchaseOrder as receivePurchaseOrderAction } from "@/actions/purchases";
import { unitLabels } from "./enum-labels";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const receivePurchaseOrder = withActionErrors(receivePurchaseOrderAction);

type LineState = {
  purchaseOrderItemId: string;
  receivedQuantity: string;
  actualUnitCost: string;
  expirationDate: string;
};

export function ReceiveOrderForm({
  employeeId,
  order,
}: {
  employeeId: string;
  order: PurchaseOrderDetail;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LineState[]>(
    // Se captura en la presentación con que se pidió (ej. cajas); el
    // servidor convierte a baseUnit (ver receivePurchaseOrder).
    order.items.map((item) => {
      const size = item.unitsPerPresentation ?? 1;
      return {
        purchaseOrderItemId: item.id,
        receivedQuantity: String(roundQty(item.pendingQuantity / size)),
        actualUnitCost: String(roundQty(item.estimatedUnitCost * size)),
        expirationDate: "",
      };
    })
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((line) => (line.purchaseOrderItemId === id ? { ...line, ...patch } : line)));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await receivePurchaseOrder({
          employeeId,
          purchaseOrderId: order.id,
          lines: lines.map((line) => ({
            purchaseOrderItemId: line.purchaseOrderItemId,
            receivedQuantity: Number(line.receivedQuantity) || 0,
            actualUnitCost: Number(line.actualUnitCost) || 0,
            expirationDate: line.expirationDate || undefined,
          })),
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la recepción.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recibir orden</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {order.items.map((item) => {
          const line = lines.find((l) => l.purchaseOrderItemId === item.id)!;
          const size = item.unitsPerPresentation ?? 1;
          const unitLabel = item.presentationName ?? unitLabels[item.unit as keyof typeof unitLabels] ?? item.unit;
          const isFullyReceived = item.pendingQuantity <= 0;
          return (
            <div key={item.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0">
              <p className="text-sm font-medium">
                {item.ingredientName} — pedido: {roundQty(item.orderedQuantity / size)} {unitLabel}
                {(item.receivedQuantity ?? 0) > 0 &&
                  ` · recibido hasta ahora: ${roundQty((item.receivedQuantity ?? 0) / size)} ${unitLabel}`}
                {" · "}pendiente: {roundQty(item.pendingQuantity / size)} {unitLabel} · costo estimado{" "}
                {formatUnitCost(item.estimatedUnitCost * size)} por {unitLabel} (≈{" "}
                {formatCurrency(item.estimatedUnitCost * item.orderedQuantity)})
              </p>
              {isFullyReceived ? (
                <p className="text-xs text-muted-foreground">Ya se recibió por completo.</p>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`qty-${item.id}`}>Cantidad recibida (esta pasada)</Label>
                    <Input
                      id={`qty-${item.id}`}
                      type="number"
                      min="0"
                      max={roundQty(item.pendingQuantity / size)}
                      step="0.01"
                      className="w-28"
                      value={line.receivedQuantity}
                      onChange={(e) => updateLine(item.id, { receivedQuantity: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`cost-${item.id}`}>Costo real por {unitLabel}</Label>
                    <Input
                      id={`cost-${item.id}`}
                      type="number"
                      min="0"
                      step="0.0001"
                      className="w-28"
                      value={line.actualUnitCost}
                      onChange={(e) => updateLine(item.id, { actualUnitCost: e.target.value })}
                    />
                  </div>
                  {item.tracksExpiration && (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`exp-${item.id}`}>Caducidad (opcional)</Label>
                      <Input
                        id={`exp-${item.id}`}
                        type="date"
                        className="w-40"
                        value={line.expirationDate}
                        onChange={(e) => updateLine(item.id, { expirationDate: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Registrando..." : "Registrar recepción"}
        </Button>
      </CardContent>
    </Card>
  );
}
