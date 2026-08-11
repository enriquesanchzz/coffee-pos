"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { closeShift, previewShiftClose } from "@/actions/shift";

type Preview = {
  openingCash: number;
  cashSalesTotal: number;
  retirosTotal: number;
  ingresosTotal: number;
  expectedCash: number;
};

export function CloseShiftDialog({
  open,
  onOpenChange,
  shiftId,
  cashierId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: string;
  cashierId: string;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [closingCash, setClosingCash] = useState("0");
  const [differenceReason, setDifferenceReason] = useState("");
  const [confirmingPin, setConfirmingPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setClosingCash("0");
    setDifferenceReason("");
    setConfirmingPin("");
    setError(null);
    previewShiftClose(shiftId).then(setPreview);
  }, [open, shiftId]);

  const difference = preview ? (Number(closingCash) || 0) - preview.expectedCash : 0;
  const hasDifference = Math.abs(difference) > 0.01;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await closeShift({
          shiftId,
          cashierId,
          closingCash: Number(closingCash) || 0,
          differenceReason: hasDifference ? differenceReason : undefined,
          confirmingPin,
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cerrar el turno.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cerrar turno">
      {!preview ? (
        <p className="text-sm text-muted-foreground">Calculando efectivo esperado...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fondo inicial</span>
              <span>{formatCurrency(preview.openingCash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ventas en efectivo</span>
              <span>{formatCurrency(preview.cashSalesTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Retiros</span>
              <span>-{formatCurrency(preview.retirosTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingresos</span>
              <span>{formatCurrency(preview.ingresosTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-medium">
              <span>Efectivo esperado</span>
              <span>{formatCurrency(preview.expectedCash)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="closingCash">Efectivo contado</Label>
            <Input
              id="closingCash"
              type="number"
              min="0"
              step="0.01"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
            />
          </div>

          {hasDifference && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-destructive">
                Diferencia de {formatCurrency(difference)} — captura el motivo.
              </p>
              <Label htmlFor="differenceReason">Motivo de la diferencia</Label>
              <Input
                id="differenceReason"
                value={differenceReason}
                onChange={(e) => setDifferenceReason(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="confirmingPin">PIN de quien autoriza el cierre</Label>
            <Input
              id="confirmingPin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="PIN de un empleado distinto"
              value={confirmingPin}
              onChange={(e) => setConfirmingPin(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Cerrando..." : "Confirmar cierre"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
