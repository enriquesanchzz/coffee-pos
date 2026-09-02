"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approvePhysicalCount } from "@/actions/counts";

export function ApproveCountForm({ physicalCountId }: { physicalCountId: string }) {
  const router = useRouter();
  const [confirmingPin, setConfirmingPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDecision(decision: "APROBADO" | "RECHAZADO") {
    setError(null);
    startTransition(async () => {
      try {
        await approvePhysicalCount({ physicalCountId, confirmingPin, decision });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo procesar la aprobación.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aprobar conteo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="confirmingPin">PIN de quien aprueba (empleado distinto de quien contó)</Label>
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

        <div className="flex gap-2">
          <Button onClick={() => handleDecision("APROBADO")} disabled={isPending}>
            {isPending ? "Procesando..." : "Aprobar"}
          </Button>
          <Button variant="outline" onClick={() => handleDecision("RECHAZADO")} disabled={isPending}>
            Rechazar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
