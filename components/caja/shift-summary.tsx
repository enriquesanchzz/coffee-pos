"use client";

import { useState } from "react";
import type { ShiftDetail } from "@/lib/shift";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { logoutAction } from "@/actions/session";
import { CashMovementDialog } from "./cash-movement-dialog";
import { CloseShiftDialog } from "./close-shift-dialog";

export function ShiftSummary({
  shift,
  employee,
}: {
  shift: ShiftDetail;
  employee: { id: string; name: string };
}) {
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Cajero: <span className="font-medium text-foreground">{shift.cashierName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Turno {shift.type.toLowerCase()} — abierto{" "}
            {new Date(shift.openedAt).toLocaleString("es-MX")}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted-foreground hover:underline">
            Cambiar de empleado
          </button>
        </form>
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
                    {new Date(movement.createdAt).toLocaleString("es-MX")}
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
      <CloseShiftDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        shiftId={shift.id}
        cashierId={employee.id}
      />
    </div>
  );
}
