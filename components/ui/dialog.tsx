"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Modal simple y controlado, sin Radix. Cubre lo que el POS necesita hoy
// (checkout, apertura de turno). El día que se necesite algo más complejo
// (anidar diálogos, manejo fino de foco/teclado, portales) migrar a
// @radix-ui/react-dialog — ya contemplado en el ADR de stack.
//
// placement="drawer" ancla el panel a la derecha, a la izquierda de la
// columna del carrito del POS (360px), para que la cuenta siga visible
// mientras se personaliza un producto.
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
  placement = "center",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  placement?: "center" | "drawer";
}) {
  if (!open) return null;

  if (placement === "drawer") {
    return (
      <div className="fixed inset-0 z-50 bg-black/20" onClick={() => onOpenChange(false)}>
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "fixed bottom-0 right-0 top-0 flex w-full max-w-[420px] flex-col overflow-y-auto border-l border-border bg-background p-6 shadow-lg md:right-[320px] lg:right-[360px]",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
