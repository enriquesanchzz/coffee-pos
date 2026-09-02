"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markTransferInTransit, cancelTransferManifest } from "@/actions/transfers";

export function TransferStatusActions({
  employeeId,
  transferManifestId,
}: {
  employeeId: string;
  transferManifestId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleMarkInTransit() {
    setError(null);
    startTransition(async () => {
      try {
        await markTransferInTransit({ employeeId, transferManifestId });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo marcar en tránsito.");
      }
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelTransferManifest({ employeeId, transferManifestId });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cancelar.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button onClick={handleMarkInTransit} disabled={isPending}>
          {isPending ? "Procesando..." : "Marcar en tránsito"}
        </Button>
        <Button variant="outline" onClick={handleCancel} disabled={isPending}>
          Cancelar transferencia
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
