"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelPurchaseOrder } from "@/actions/purchases";

export function CancelOrderButton({
  employeeId,
  purchaseOrderId,
}: {
  employeeId: string;
  purchaseOrderId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelPurchaseOrder({ employeeId, purchaseOrderId });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cancelar la orden.");
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <Button variant="destructive" size="sm" onClick={handleCancel} disabled={isPending}>
          {isPending ? "Cancelando..." : "¿Cancelar orden?"}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Cancelar orden
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
