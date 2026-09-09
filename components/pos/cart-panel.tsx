"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useCartStore, lineUnitPrice } from "./cart-store";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const { lines, incrementLine, decrementLine, removeLine, subtotal } = useCartStore();

  return (
    <div className="flex h-full flex-col border-l border-border">
      <div className="border-b border-border p-4">
        <p className="font-semibold">Cuenta actual</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {lines.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Selecciona productos del catálogo para agregarlos aquí.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li key={line.lineId} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {line.productName} · {line.variantName}
                  </p>
                  {(line.modifiers.length > 0 || line.extraIngredients.length > 0) && (
                    <p className="text-xs text-muted-foreground">
                      {[
                        ...line.modifiers.map((m) => m.name),
                        ...line.extraIngredients.map((e) => `+ ${e.name} (${e.quantity}${e.unit})`),
                      ].join(", ")}
                    </p>
                  )}
                  {line.notes && (
                    <p className="text-xs italic text-muted-foreground">“{line.notes}”</p>
                  )}
                </div>
                <button
                  onClick={() => removeLine(line.lineId)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Quitar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => decrementLine(line.lineId)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm">{line.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => incrementLine(line.lineId)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <span className="text-sm font-medium">
                  {formatCurrency(lineUnitPrice(line) * line.quantity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-center justify-between text-sm font-medium">
          <span>Total</span>
          <span>{formatCurrency(subtotal())}</span>
        </div>
        <Button className="w-full" disabled={lines.length === 0} onClick={onCheckout}>
          Cobrar
        </Button>
      </div>
    </div>
  );
}
