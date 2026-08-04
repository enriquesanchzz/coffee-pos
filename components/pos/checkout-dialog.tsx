"use client";

import { useState, useTransition } from "react";
import { PaymentMethod } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { createSale } from "@/actions/pos";
import { useCartStore } from "./cart-store";

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

export function CheckoutDialog({
  open,
  onOpenChange,
  branchId,
  shiftId,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  shiftId: string;
  employeeId: string;
}) {
  const { lines, subtotal, clear } = useCartStore();
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = subtotal();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await createSale({
          branchId,
          shiftId,
          employeeId,
          items: lines.map((line) => ({
            productVariantId: line.productVariantId,
            quantity: line.quantity,
            modifierOptionIds: line.modifiers.map((m) => m.modifierOptionId),
          })),
          // El checkout hoy solo soporta un método por venta. El modelo
          // (SalePayment) ya permite pagos divididos — falta la UI.
          payments: [{ method, amount: total }],
        });
        clear();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cobrar">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Método de pago</p>
          <div className="flex gap-2">
            {paymentMethods.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={
                  "flex-1 rounded-md border border-border px-3 py-2 text-sm " +
                  (method === m.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleConfirm} disabled={isPending || lines.length === 0}>
          {isPending ? "Procesando..." : "Confirmar venta"}
        </Button>
      </div>
    </Dialog>
  );
}
