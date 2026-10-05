"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Modal simple y controlado, sin Radix. Cubre lo que el POS necesita hoy
// (checkout, apertura de turno). El día que se necesite algo más complejo
// (anidar diálogos, portales) migrar a @radix-ui/react-dialog — ya
// contemplado en el ADR de stack.
//
// Accesibilidad básica: Esc cierra, botón "Cerrar" visible, el foco entra
// al diálogo al abrir, Tab/Shift+Tab no se salen de él, y al cerrar el foco
// regresa al elemento que lo abrió.
//
// placement="drawer" ancla el panel a la derecha, a la izquierda de la
// columna del carrito del POS (320px en tablet, 360px en escritorio), para
// que la cuenta siga visible mientras se personaliza un producto. En
// celular ocupa todo el ancho.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Primer campo del diálogo (no el botón de cerrar), si existe.
    const focusables = panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    const firstField = focusables.find((el) => !el.dataset.dialogClose) ?? focusables[0];
    (firstField ?? panel)?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChangeRef.current(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const header = (
    <div className="mb-4 flex items-start justify-between gap-4">
      {title ? (
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
      ) : (
        <span />
      )}
      <button
        type="button"
        data-dialog-close="true"
        onClick={() => onOpenChange(false)}
        className="-mr-2 -mt-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  if (placement === "drawer") {
    return (
      <div className="fixed inset-0 z-50 bg-black/20" onClick={() => onOpenChange(false)}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          className={cn(
            "fixed bottom-0 right-0 top-0 flex w-full max-w-[420px] flex-col overflow-y-auto border-l border-border bg-background p-6 shadow-lg outline-none md:right-[320px] lg:right-[360px]",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {header}
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg outline-none",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        {children}
      </div>
    </div>
  );
}
