"use client";

import { useState, useTransition } from "react";
import { CashMovementType } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCashMovement } from "@/actions/cash";

const movementTypes: { value: CashMovementType; label: string }[] = [
  { value: "RETIRO", label: "Retiro" },
  { value: "INGRESO", label: "Ingreso" },
];

export function CashMovementDialog({
  open,
  onOpenChange,
  shiftId,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: string;
  employeeId: string;
}) {
  const [type, setType] = useState<CashMovementType>("RETIRO");
  const [amount, setAmount] = useState("0");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await createCashMovement({
          shiftId,
          employeeId,
          type,
          amount: Number(amount) || 0,
          reason,
        });
        setAmount("0");
        setReason("");
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar el movimiento.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Movimiento de caja">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {movementTypes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setType(m.value)}
              className={
                "flex-1 rounded-md border border-border px-3 py-2 text-sm " +
                (type === m.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted")
              }
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="amount">Monto</Label>
          <Input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="reason">Motivo</Label>
          <Input
            id="reason"
            placeholder="ej. compra de hielo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleConfirm} disabled={isPending}>
          {isPending ? "Registrando..." : "Registrar movimiento"}
        </Button>
      </div>
    </Dialog>
  );
}
