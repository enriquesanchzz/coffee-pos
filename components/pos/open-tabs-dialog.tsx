"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, pluralize } from "@/lib/utils";
import { listOpenTabs as listOpenTabsAction, type OpenTabSummary } from "@/actions/pos";
import { useCartStore } from "./cart-store";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const listOpenTabs = withActionErrors(listOpenTabsAction);

// Etiqueta de cada cuenta en espera — Mesa sigue usando su número; Para
// llevar/A domicilio usan la referencia libre que capturó el cajero
// (D7, "mistake recovery": antes solo Mesa se podía pausar).
function tabLabel(tab: OpenTabSummary): string {
  if (tab.orderType === "CONSUMO_LOCAL") return `Mesa ${tab.tableNumber}`;
  const kind = tab.orderType === "DOMICILIO" ? "A domicilio" : "Para llevar";
  return tab.tableNumber ? `${kind} — ${tab.tableNumber}` : kind;
}

// Lista de cuentas dejadas en espera (cualquier tipo de orden) — retomar
// una carga su tipo de orden, mesa/referencia y cliente en el carrito
// para seguir agregando productos o cobrarla.
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
        setError(err instanceof Error ? err.message : "No se pudieron cargar las cuentas en espera.");
      }
    });
  }, [open, branchId]);

  function handleResume(tab: OpenTabSummary) {
    setOrderType(tab.orderType);
    setTableNumber(tab.tableNumber ?? "");
    setActiveTabId(tab.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cuentas en espera">
      <div className="flex flex-col gap-3">
        {isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {error && <Alert variant="error">{error}</Alert>}
        {!isPending && !error && tabs.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay cuentas en espera por ahora.</p>
        )}
        <ul className="flex flex-col gap-2">
          {tabs.map((tab) => (
            <li key={tab.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">
                  {tabLabel(tab)}
                  {tab.customerName && ` · ${tab.customerName}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralize(tab.itemCount, "producto")} · {formatCurrency(tab.total)}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <a
                  href={`/pos/cuenta/${tab.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
                >
                  Imprimir cuenta
                </a>
                <Button size="sm" onClick={() => handleResume(tab)}>
                  Retomar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
