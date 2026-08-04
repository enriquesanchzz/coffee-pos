"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Modal simple y controlado, sin Radix. Cubre lo que el POS necesita hoy
// (checkout, apertura de turno). El día que se necesite algo más complejo
// (anidar diálogos, manejo fino de foco/teclado, portales) migrar a
// @radix-ui/react-dialog — ya contemplado en el ADR de stack.
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;

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
