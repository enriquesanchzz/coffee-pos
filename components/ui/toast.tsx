"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";
type Toast = { id: number; variant: ToastVariant; message: string };

const DURATION_MS = 3500;

// Fondo sólido (a diferencia de <Alert>, pensado para vivir dentro de una
// tarjeta clara) — este flota sobre cualquier contenido, incluida la barra
// de sesión oscura (SessionBar), donde un fondo translúcido se ve ilegible.
const TOAST_VARIANTS: Record<ToastVariant, string> = {
  success: "border-emerald-700 bg-emerald-600 text-white",
  error: "border-destructive bg-destructive text-destructive-foreground",
  info: "border-neutral-700 bg-neutral-800 text-white",
};

const ToastContext = createContext<((message: string, variant?: ToastVariant) => void) | null>(null);

// Mensajes de confirmación globales (crear/editar/borrar/cerrar algo, en
// cualquier sección) — antes cada acción exitosa cerraba su diálogo sin
// avisar nada, y el usuario no podía saber si de verdad se guardó.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, variant, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {/* bottom-16 (no bottom-4): toda página autenticada tiene la barra de
          sesión fija de 48px (h-12, AuthenticatedShell/SessionBar) debajo
          del contenido — con bottom-4 el toast quedaba tapado por ella. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-md border px-3 py-2 text-sm shadow-lg",
              TOAST_VARIANTS[t.variant]
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast debe usarse dentro de ToastProvider.");
  return notify;
}
