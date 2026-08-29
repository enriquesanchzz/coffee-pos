"use client";

import { useEffect, useState, useTransition } from "react";
import type { InventoryOverviewItem } from "@/lib/inventory";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustInventoryStock } from "@/actions/inventory";
import { unitLabels } from "./unit-labels";

export function AdjustStockDialog({
  item,
  employeeId,
  onOpenChange,
}: {
  item: InventoryOverviewItem | null;
  employeeId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [newQuantity, setNewQuantity] = useState("0");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (item) {
      setNewQuantity(String(item.quantity));
      setReason("");
      setError(null);
    }
  }, [item]);

  function handleConfirm() {
    if (!item) return;
    setError(null);
    startTransition(async () => {
      try {
        await adjustInventoryStock({
          ingredientId: item.id,
          employeeId,
          newQuantity: Number(newQuantity) || 0,
          reason,
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar el ajuste.");
      }
    });
  }

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange} title="Ajustar stock">
      {item && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              Cantidad actual: {new Intl.NumberFormat("es-MX").format(item.quantity)}{" "}
              {unitLabels[item.baseUnit] ?? item.baseUnit}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="newQuantity">Cantidad real contada</Label>
            <Input
              id="newQuantity"
              type="number"
              min="0"
              step="0.01"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="reason">Motivo</Label>
            <Input
              id="reason"
              placeholder="ej. conteo físico, merma por caducidad"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar ajuste"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
