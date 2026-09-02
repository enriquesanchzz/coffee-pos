"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TransferManifestDetail } from "@/lib/transfers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { receiveTransfer } from "@/actions/transfers";
import { unitLabels } from "./enum-labels";

type LineState = {
  transferLineId: string;
  receivedQuantity: string;
  discrepancyNote: string;
};

export function ReceiveTransferForm({
  employeeId,
  manifest,
}: {
  employeeId: string;
  manifest: TransferManifestDetail;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LineState[]>(
    manifest.lines.map((line) => ({
      transferLineId: line.id,
      receivedQuantity: String(line.quantity),
      discrepancyNote: "",
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((line) => (line.transferLineId === id ? { ...line, ...patch } : line)));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await receiveTransfer({
          employeeId,
          transferManifestId: manifest.id,
          lines: lines.map((line) => ({
            transferLineId: line.transferLineId,
            receivedQuantity: Number(line.receivedQuantity) || 0,
            discrepancyNote: line.discrepancyNote || undefined,
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
        <CardTitle>Recibir transferencia</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {manifest.lines.map((item) => {
          const line = lines.find((l) => l.transferLineId === item.id)!;
          const unitLabel = unitLabels[item.unit as keyof typeof unitLabels] ?? item.unit;
          return (
            <div key={item.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0">
              <p className="text-sm font-medium">
                {item.ingredientName} — enviado: {item.quantity} {unitLabel}
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
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor={`note-${item.id}`}>Nota de discrepancia (opcional)</Label>
                  <Input
                    id={`note-${item.id}`}
                    value={line.discrepancyNote}
                    onChange={(e) => updateLine(item.id, { discrepancyNote: e.target.value })}
                    placeholder="ej. se rompió en el camino"
                  />
                </div>
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
