"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CancelSaleDialog } from "@/components/caja/cancel-sale-dialog";
import type { ShiftSaleRow } from "@/lib/shift";

// Anular desde Ventas → detalle. Solo se muestra si la venta es del turno
// abierto; cancelSale (actions/pos.ts) vuelve a validarlo del lado servidor.
export function VoidSaleButton({
  sale,
  branchId,
  shiftId,
  employeeId,
}: {
  sale: ShiftSaleRow;
  branchId: string;
  shiftId: string;
  employeeId: string;
}) {
  const [open, setOpen] = useState(false);
  const isOpenTab = sale.status === "ABIERTA";
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {isOpenTab ? "Cancelar cuenta" : "Anular venta"}
      </Button>
      <CancelSaleDialog
        sale={open ? sale : null}
        onOpenChange={setOpen}
        branchId={branchId}
        shiftId={shiftId}
        employeeId={employeeId}
      />
    </>
  );
}
