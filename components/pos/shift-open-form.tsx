"use client";

import { useState, useTransition } from "react";
import { ShiftType } from "@prisma/client";
import { openShift } from "@/actions/shift";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ShiftOpenForm({
  branchId,
  employeeId,
}: {
  branchId: string;
  employeeId: string;
}) {
  const [type, setType] = useState<ShiftType>("MATUTINO");
  const [openingCash, setOpeningCash] = useState("0");
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
            No hay un turno abierto en esta sucursal. El módulo de Caja
            completo (doble confirmación, cortes, retiros e ingresos) aún no
            está construido — esta es una apertura mínima para poder vender.
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Abriendo..." : "Abrir turno"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
