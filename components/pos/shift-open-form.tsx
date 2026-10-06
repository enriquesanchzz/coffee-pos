"use client";

import { useBusinessSettings } from "@/components/layout/business-settings-context";
import { useEffect, useState, useTransition } from "react";
import { ShiftType } from "@prisma/client";
import { openShift as openShiftAction } from "@/actions/shift";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withActionErrors } from "@/lib/action-result";
import { zonedClock } from "@/lib/time";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const openShift = withActionErrors(openShiftAction);

export function ShiftOpenForm({
  branchId,
  employeeId,
}: {
  branchId: string;
  employeeId: string;
}) {
  // Configuración → Caja y turnos.
  const { shiftChangeHour, defaultOpeningCash } = useBusinessSettings();
  const [type, setType] = useState<ShiftType>("MATUTINO");
  // Propone el turno según la hora de la sucursal (antes siempre decía
  // Matutino, incluso de noche). En un efecto para no desalinear el HTML
  // del servidor al hidratar.
  useEffect(() => {
    if (zonedClock(new Date()).hour >= shiftChangeHour) setType("VESPERTINO");
  }, [shiftChangeHour]);
  const [openingCash, setOpeningCash] = useState(String(defaultOpeningCash));
  const [confirmingPin, setConfirmingPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await openShift({
          branchId,
          cashierId: employeeId,
          type,
          openingCash: Number(openingCash) || 0,
          confirmingPin,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo abrir el turno.");
      }
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Abrir turno</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            No hay un turno abierto en esta sucursal. Se requiere el PIN de un
            segundo empleado para autorizar la apertura; uno de los dos debe
            ser gerente o administrador.
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="type">Tipo de turno</Label>
            <select
              id="type"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as ShiftType)}
            >
              <option value="MATUTINO">Matutino</option>
              <option value="VESPERTINO">Vespertino</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="openingCash">Fondo de caja inicial</Label>
            <Input
              id="openingCash"
              type="number"
              min="0"
              step="0.01"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="confirmingPin">PIN de quien autoriza la apertura</Label>
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
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Abriendo..." : "Abrir turno"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
