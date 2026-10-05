"use client";

import { useState } from "react";
import type { ShiftDetail, ShiftSaleRow } from "@/lib/shift";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { CashMovementDialog } from "./cash-movement-dialog";
import { CloseShiftDialog } from "./close-shift-dialog";
import { CancelSaleDialog } from "./cancel-sale-dialog";

const orderTypeLabels: Record<string, string> = {
  CONSUMO_LOCAL: "Mesa",
  PARA_LLEVAR: "Para llevar",
  DOMICILIO: "A domicilio",
};

const paymentMethodLabels: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
};
import { formatDateTime } from "@/lib/time";

export function ShiftSummary({
  shift,
  employee,
}: {
  shift: ShiftDetail;
  employee: { id: string; name: string };
}) {
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState<ShiftSaleRow | null>(null);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-y-auto p-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Cajero: <span className="font-medium text-foreground">{shift.cashierName}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Turno {shift.type.toLowerCase()} — abierto{" "}
          {formatDateTime(shift.openedAt)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen del turno</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fondo inicial</span>
            <span>{formatCurrency(shift.openingCash)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ventas ({shift.salesCount})</span>
            <span>{formatCurrency(shift.salesTotal)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ventas del turno</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {shift.sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>
          ) : (
            shift.sales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p>
                    {sale.status === "ABIERTA"
                      ? `Cuenta abierta · Mesa ${sale.tableNumber ?? "—"}`
                      : `${orderTypeLabels[sale.orderType] ?? sale.orderType}${
                          sale.tableNumber ? ` ${sale.tableNumber}` : ""
                        } · ${sale.paymentMethods.map((m) => paymentMethodLabels[m] ?? m).join(", ")}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sale.employeeName} — {formatDateTime(sale.createdAt)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span>{formatCurrency(sale.total + sale.tipAmount)}</span>
                  <Button size="sm" variant="outline" onClick={() => setSaleToCancel(sale)}>
                    {sale.status === "ABIERTA" ? "Cancelar" : "Anular"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos de efectivo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {shift.cashMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin retiros ni ingresos todavía.</p>
          ) : (
            shift.cashMovements.map((movement) => (
              <div key={movement.id} className="flex justify-between text-sm">
                <div>
                  <p>
                    {movement.type === "RETIRO" ? "Retiro" : "Ingreso"} — {movement.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {movement.employeeName} —{" "}
                    {formatDateTime(movement.createdAt)}
                  </p>
                </div>
                <span>
                  {movement.type === "RETIRO" ? "-" : "+"}
                  {formatCurrency(movement.amount)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setMovementOpen(true)}>
          Registrar retiro/ingreso
        </Button>
        <Button variant="destructive" className="flex-1" onClick={() => setCloseOpen(true)}>
          Cerrar turno
        </Button>
      </div>

      <CashMovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        shiftId={shift.id}
        employeeId={employee.id}
      />
      <CancelSaleDialog
        sale={saleToCancel}
        onOpenChange={(open) => {
          if (!open) setSaleToCancel(null);
        }}
        branchId={shift.branchId}
        shiftId={shift.id}
        employeeId={employee.id}
      />
      <CloseShiftDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        shiftId={shift.id}
        cashierId={employee.id}
      />
    </div>
  );
}
