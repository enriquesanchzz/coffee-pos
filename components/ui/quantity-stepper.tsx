"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// − cantidad + con objetivos de 44 px y nombre accesible en cada botón
// (auditoría UI-03/MF-2). `itemName` arma "Quitar uno de Latte Grande".
export function QuantityStepper({
  value,
  onDecrement,
  onIncrement,
  itemName,
  disabled,
  min = 1,
  className,
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  itemName: string;
  disabled?: boolean;
  // Con value <= min, "−" se deshabilita; con min = 0, "−" en 1 sigue
  // activo (quitar el producto lo decide quien llama).
  min?: number;
  className?: string;
}) {
  const buttonClass =
    "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        className={buttonClass}
        onClick={onDecrement}
        disabled={disabled || value <= min}
        aria-label={`Quitar uno de ${itemName}`}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite" aria-label={`Cantidad: ${value}`}>
        {value}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={onIncrement}
        disabled={disabled}
        aria-label={`Agregar uno de ${itemName}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
