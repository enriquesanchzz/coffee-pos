"use client";

import { useEffect, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { listOpenTabs, type OpenTabSummary } from "@/actions/pos";
import { useCartStore } from "./cart-store";

// Lista de cuentas de Mesa dejadas abiertas (ver "cambios para la
// sección de punto de venta") — retomar una carga su mesa/tipo de orden
// en el carrito para seguir agregando productos o cobrarla.
export function OpenTabsDialog({
  open,
  onOpenChange,
  branchId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
}) {
  const { setOrderType, setTableNumber, setActiveTabId } = useCartStore();
  const [tabs, setTabs] = useState<OpenTabSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    startTransition(async () => {
      try {
        setTabs(await listOpenTabs(branchId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las cuentas abiertas.");
      }
    });
  }, [open, branchId]);

  function handleResume(tab: OpenTabSummary) {
    setOrderType("CONSUMO_LOCAL");
    setTableNumber(tab.tableNumber ?? "");
    setActiveTabId(tab.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cuentas abiertas">
      <div className="flex flex-col gap-3">
        {isPending && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!isPending && !error && tabs.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay cuentas abiertas por ahora.</p>
        )}
        <ul className="flex flex-col gap-2">
          {tabs.map((tab) => (
            <li key={tab.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Mesa {tab.tableNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {tab.itemCount} productos · {formatCurrency(tab.total)}
                </p>
              </div>
              <Button size="sm" onClick={() => handleResume(tab)}>
                Retomar
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
