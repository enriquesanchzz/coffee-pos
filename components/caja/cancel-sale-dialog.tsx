"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import type { ShiftSaleRow } from "@/lib/shift";
import { cancelSale as cancelSaleAction } from "@/actions/pos";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const cancelSale = withActionErrors(cancelSaleAction);

// Anular una venta cobrada o una cuenta abierta del turno (ver cancelSale
// en actions/pos.ts): exige motivo y PIN de alguien con VENTA_CANCELAR.
export function CancelSaleDialog({
  sale,
  onOpenChange,
  branchId,
  shiftId,
  employeeId,
}: {
  sale: ShiftSaleRow | null;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  shiftId: string;
  employeeId: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setReason("");
    setPin("");
    setError(null);
  }, [sale?.id]);

  function handleConfirm() {
    if (!sale) return;
    setError(null);
    startTransition(async () => {
      try {
        await cancelSale({
          saleId: sale.id,
          branchId,
          shiftId,
          employeeId,
          authorizingPin: pin,
          reason,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo anular la venta.");
      }
    });
  }

  const isOpenTab = sale?.status === "ABIERTA";

  return (
    <Dialog
      open={sale !== null}
      onOpenChange={onOpenChange}
      title={isOpenTab ? "Cancelar cuenta abierta" : "Anular venta"}
    >
      {sale && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {isOpenTab ? `Mesa ${sale.tableNumber ?? "—"}` : "Venta"} por{" "}
            {formatCurrency(sale.total + sale.tipAmount)}. Se regresa al inventario lo que se
            descontó y la venta deja de contar en el corte y en los reportes.
            {!isOpenTab && " El dinero cobrado debe devolverse al cliente."}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cancel-reason">Motivo</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ej. se cobró dos veces, el cliente se fue"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cancel-pin">PIN de quien autoriza</Label>
            <Input
              id="cancel-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN de un empleado con permiso"
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending || !reason.trim() || !pin}
          >
            {isPending ? "Anulando..." : isOpenTab ? "Cancelar cuenta" : "Anular venta"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
