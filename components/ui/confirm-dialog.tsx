"use client";

import { Dialog } from "./dialog";
import { Button } from "./button";

// Confirmación para acciones destructivas o de alto impacto (quitarse el
// propio acceso, desactivar a alguien, bajar un precio...). Controlado: el
// llamador decide qué hacer en onConfirm.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted-foreground">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
