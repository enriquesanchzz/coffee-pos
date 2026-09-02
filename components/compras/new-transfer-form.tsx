"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UnitOfMeasure } from "@prisma/client";
import type { IngredientOption } from "@/lib/purchases";
import type { StockLocationOption } from "@/lib/transfers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createTransferManifest } from "@/actions/transfers";
import {
  TransferLinesEditor,
  initialTransferLine,
  type TransferLineDraft,
} from "./transfer-lines-editor";

export function NewTransferForm({
  employeeId,
  stockLocations,
  ingredients,
}: {
  employeeId: string;
  stockLocations: StockLocationOption[];
  ingredients: IngredientOption[];
}) {
  const router = useRouter();
  const [fromStockLocationId, setFromStockLocationId] = useState(stockLocations[0]?.id ?? "");
  const [toStockLocationId, setToStockLocationId] = useState(stockLocations[1]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLineDraft[]>([initialTransferLine()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const validLines = lines.filter((l) => l.ingredientId);
        const result = await createTransferManifest({
          employeeId,
          fromStockLocationId,
          toStockLocationId,
          notes,
          lines: validLines.map((l) => ({
            ingredientId: l.ingredientId,
            quantity: Number(l.quantity) || 0,
            unit: ingredientById.get(l.ingredientId)!.baseUnit as UnitOfMeasure,
          })),
        });
        router.push(`/compras/transferencias/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear la transferencia.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">Nueva transferencia</h1>

      <Card>
        <CardHeader>
          <CardTitle>Origen y destino</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="from">Origen</Label>
              <Select id="from" value={fromStockLocationId} onChange={(e) => setFromStockLocationId(e.target.value)}>
                {stockLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="to">Destino</Label>
              <Select id="to" value={toStockLocationId} onChange={(e) => setToStockLocationId(e.target.value)}>
                {stockLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingredientes a transferir</CardTitle>
        </CardHeader>
        <CardContent>
          <TransferLinesEditor lines={lines} onChange={setLines} ingredients={ingredients} />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending || fromStockLocationId === toStockLocationId}>
        {isPending ? "Creando..." : "Crear transferencia"}
      </Button>
    </div>
  );
}
