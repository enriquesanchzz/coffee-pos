"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS } from "@/lib/settings-shared";
import type { SaleOrderType } from "@prisma/client";
import type { SaleReceipt } from "./checkout-form";

// Confirmación de "Dejar en espera" / "Agregar a la cuenta" — mismo
// patrón de popup que SaleReceipt, para que esa acción también avise algo
// (antes no dejaba ningún mensaje, el cajero no sabía si de verdad se
// guardó). Cubre cualquier tipo de orden (D7, "mistake recovery") — antes
// solo existía para Mesa.
export type TabConfirmation = {
  tableNumber: string;
  orderType: SaleOrderType;
  itemCount: number;
  total: number;
  isNewTab: boolean;
};

function tabConfirmationLabel(tc: TabConfirmation): string {
  if (tc.orderType === "CONSUMO_LOCAL") return `Mesa ${tc.tableNumber}`;
  const kind = tc.orderType === "DOMICILIO" ? "A domicilio" : "Para llevar";
  return tc.tableNumber ? `${kind} — ${tc.tableNumber}` : kind;
}

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
      title={saleReceipt ? "Venta registrada" : tabConfirmation?.isNewTab ? "Pedido dejado en espera" : "Cuenta actualizada"}
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
                {saleReceipt.payments.length > 1 && (
                  // Pago dividido (D8) — un renglón por método.
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagado con</p>
                    {saleReceipt.payments.map((p, i) => (
                      <p key={i} className="flex justify-between gap-4">
                        <span>
                          {PAYMENT_METHOD_LABELS[p.method]}
                          {p.tipAmount ? (
                            <span className="text-muted-foreground"> · propina {formatCurrency(p.tipAmount)}</span>
                          ) : null}
                        </span>
                        <span className="font-medium">{formatCurrency(p.amount)}</span>
                      </p>
                    ))}
                  </div>
                )}
                {saleReceipt.change !== null ? (
                  <>
                    <p className="text-muted-foreground">Efectivo recibido {formatCurrency(saleReceipt.cashReceived ?? 0)}</p>
                    <p className="text-lg font-bold">Cambio a entregar: {formatCurrency(saleReceipt.change)}</p>
                  </>
                ) : (
                  saleReceipt.payments.length === 1 && (
                    <p className="text-muted-foreground">
                      Pagado con {saleReceipt.payments[0]?.method === "TARJETA" ? "tarjeta" : "transferencia"}.
                    </p>
                  )
                )}
              </>
            ) : tabConfirmation ? (
              <>
                <p className="text-lg font-semibold">{tabConfirmationLabel(tabConfirmation)}</p>
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
