"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { SaleReceipt } from "./checkout-form";

// Confirmación de "Dejar cuenta abierta" / "Agregar a la cuenta" — mismo
// patrón de popup que SaleReceipt, para que esa acción también avise algo
// (antes no dejaba ningún mensaje, el cajero no sabía si de verdad se
// guardó).
export type TabConfirmation = {
  tableNumber: string;
  itemCount: number;
  total: number;
  isNewTab: boolean;
};

// Popup modal que confirma una venta cobrada o una cuenta dejada
// abierta — antes la venta mostraba un aviso fijo dentro de la lista del
// carrito que había que cerrar a mano con la X; ahora es un diálogo real
// que también se puede cerrar con Esc o clic afuera, y no se puede
// confundir con el resto de la pantalla.
export function ReceiptDialog({
  saleReceipt,
  tabConfirmation,
  onClose,
}: {
  saleReceipt: SaleReceipt | null;
  tabConfirmation: TabConfirmation | null;
  onClose: () => void;
}) {
  const open = saleReceipt !== null || tabConfirmation !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={saleReceipt ? "Venta registrada" : tabConfirmation?.isNewTab ? "Cuenta dejada abierta" : "Mesa actualizada"}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-8 w-8 flex-shrink-0 text-emerald-600" />
          <div className="flex flex-1 flex-col gap-1 text-sm">
            {saleReceipt ? (
              <>
                <p className="text-2xl font-bold">{formatCurrency(saleReceipt.total)}</p>
                {saleReceipt.taxIncluded > 0 && (
                  <p className="text-xs text-muted-foreground">Incluye IVA {formatCurrency(saleReceipt.taxIncluded)}</p>
                )}
                {saleReceipt.change !== null ? (
                  <>
                    <p className="text-muted-foreground">Recibido {formatCurrency(saleReceipt.cashReceived ?? 0)}</p>
                    <p className="text-lg font-bold">Cambio a entregar: {formatCurrency(saleReceipt.change)}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Pagado con {saleReceipt.method === "TARJETA" ? "tarjeta" : "transferencia"}.
                  </p>
                )}
              </>
            ) : tabConfirmation ? (
              <>
                <p className="text-lg font-semibold">Mesa {tabConfirmation.tableNumber}</p>
                <p className="text-muted-foreground">
                  {tabConfirmation.itemCount} producto{tabConfirmation.itemCount === 1 ? "" : "s"} registrado
                  {tabConfirmation.itemCount === 1 ? "" : "s"} · {formatCurrency(tabConfirmation.total)}
                </p>
                <p className="text-muted-foreground">
                  {tabConfirmation.isNewTab
                    ? "Queda abierta para seguir agregando o cobrarla después."
                    : "Se agregó a lo que ya tenía registrado."}
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2">
          {saleReceipt && (
            <Link
              href={`/pos/ticket/${saleReceipt.saleId}`}
              target="_blank"
              className="flex flex-1 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted"
            >
              Imprimir ticket
            </Link>
          )}
          <Button className="flex-1" onClick={onClose} autoFocus>
            Cerrar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
