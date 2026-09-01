"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseOrderDetail } from "@/lib/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { receivePurchaseOrder } from "@/actions/purchases";
import { unitLabels } from "./enum-labels";

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
    order.items.map((item) => ({
      purchaseOrderItemId: item.id,
      receivedQuantity: String(item.orderedQuantity),
      actualUnitCost: String(item.estimatedUnitCost),
      expirationDate: "",
    }))
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
          const unitLabel = unitLabels[item.unit as keyof typeof unitLabels] ?? item.unit;
          return (
            <div key={item.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0">
              <p className="text-sm font-medium">
                {item.ingredientName} — pedido: {item.orderedQuantity} {unitLabel} · estimado{" "}
                {formatCurrency(item.estimatedUnitCost)}
              </p>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`qty-${item.id}`}>Cantidad recibida</Label>
                  <Input
                    id={`qty-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28"
                    value={line.receivedQuantity}
                    onChange={(e) => updateLine(item.id, { receivedQuantity: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`cost-${item.id}`}>Costo real</Label>
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
            </div>
          );
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Registrando..." : "Registrar recepción"}
        </Button>
      </CardContent>
    </Card>
  );
}
