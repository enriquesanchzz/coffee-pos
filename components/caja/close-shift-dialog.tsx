"use client";

import { useBusinessSettings } from "@/components/layout/business-settings-context";
import { Alert } from "@/components/ui/alert";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { closeShift as closeShiftAction, previewShiftClose as previewShiftCloseAction } from "@/actions/shift";
import { withActionErrors } from "@/lib/action-result";
import { useToast } from "@/components/ui/toast";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const closeShift = withActionErrors(closeShiftAction);
const previewShiftClose = withActionErrors(previewShiftCloseAction);

type Preview = {
  openingCash: number;
  salesTotal: number;
  tipsTotal: number;
  tipsByMethod: Record<"EFECTIVO" | "TARJETA" | "TRANSFERENCIA", number>;
  cashSalesTotal: number;
  paymentsByMethod: Record<"EFECTIVO" | "TARJETA" | "TRANSFERENCIA", number>;
  retirosTotal: number;
  ingresosTotal: number;
  expectedCash: number;
};

export function CloseShiftDialog({
  open,
  onOpenChange,
  shiftId,
  cashierId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: string;
  cashierId: string;
}) {
  const { cashDifferenceTolerance } = useBusinessSettings();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [closingCash, setClosingCash] = useState("0");
  const [differenceReason, setDifferenceReason] = useState("");
  const [confirmingPin, setConfirmingPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Una vez cerrado el turno, se queda este diálogo abierto con el enlace
  // para imprimir el corte — antes se cerraba solo y esa oportunidad se
  // perdía (no había otra forma de llegar al comprobante).
  const [closed, setClosed] = useState(false);
  // Corte ciego: primero se cuenta y se registra el efectivo, y solo después
  // se pide y se muestra lo esperado. Antes el esperado salía en pantalla
  // desde el principio y el conteo se podía "ajustar" para que cuadrara.
  // El conteo registrado ya no se edita: un error de conteo se explica en
  // el motivo de la diferencia.
  const [countLocked, setCountLocked] = useState(false);
  const notify = useToast();

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setClosingCash("");
    setDifferenceReason("");
    setConfirmingPin("");
    setError(null);
    setClosed(false);
    setCountLocked(false);
  }, [open, shiftId]);

  function handleLockCount() {
    const value = Number(closingCash);
    if (closingCash.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError("Captura el efectivo contado.");
      return;
    }
    setError(null);
    setCountLocked(true);
    previewShiftClose(shiftId)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo calcular el corte."));
  }

  // La diferencia solo se evalúa una vez capturado el conteo — antes salía
  // "Diferencia de -$581.70" en cuanto se abría el diálogo.
  const hasCount = closingCash.trim() !== "";
  const difference = preview && hasCount ? (Number(closingCash) || 0) - preview.expectedCash : 0;
  // Diferencia permitida sin motivo: Configuración → Caja y turnos.
  const hasDifference = hasCount && Math.abs(difference) > cashDifferenceTolerance + 0.005;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await closeShift({
          shiftId,
          cashierId,
          closingCash: Number(closingCash),
          differenceReason: hasDifference ? differenceReason : undefined,
          confirmingPin,
        });
        setClosed(true);
        notify("Turno cerrado.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cerrar el turno.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cerrar turno">
      {closed ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">Turno cerrado correctamente.</p>
          <div className="flex gap-2">
            <Link
              href={`/caja/turno/${shiftId}/cierre`}
              target="_blank"
              className="flex flex-1 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted"
            >
              Imprimir corte de caja
            </Link>
            <Button className="flex-1" onClick={() => onOpenChange(false)} autoFocus>
              Cerrar
            </Button>
          </div>
        </div>
      ) : !countLocked ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleLockCount();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Cuenta el efectivo de la caja (incluye el fondo inicial y las propinas en efectivo) y captúralo. El
            efectivo esperado se muestra después de registrar el conteo, y el conteo ya no se puede cambiar.
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="closingCash">Efectivo contado</Label>
            <Input
              id="closingCash"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              autoFocus
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" disabled={!hasCount}>
            Registrar conteo
          </Button>
        </form>
      ) : !preview ? (
        error ? (
          <Alert variant="error">{error}</Alert>
        ) : (
          <p className="text-sm text-muted-foreground">Calculando efectivo esperado…</p>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fondo inicial</span>
              <span>{formatCurrency(preview.openingCash)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Total de ventas</span>
              <span>{formatCurrency(preview.salesTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Propinas</span>
              <span>{formatCurrency(preview.tipsTotal)}</span>
            </div>
            {preview.tipsTotal > 0 && (
              <>
                <div className="flex justify-between pl-3 text-xs">
                  <span className="text-muted-foreground">en efectivo (ya están en caja)</span>
                  <span>{formatCurrency(preview.tipsByMethod.EFECTIVO)}</span>
                </div>
                <div className="flex justify-between pl-3 text-xs">
                  <span className="text-muted-foreground">con tarjeta/transferencia (no están en caja)</span>
                  <span>{formatCurrency(preview.tipsByMethod.TARJETA + preview.tipsByMethod.TRANSFERENCIA)}</span>
                </div>
              </>
            )}
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cobrado por tipo (incluye propinas)</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Efectivo</span>
              <span>{formatCurrency(preview.paymentsByMethod.EFECTIVO)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tarjeta</span>
              <span>{formatCurrency(preview.paymentsByMethod.TARJETA)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transferencia</span>
              <span>{formatCurrency(preview.paymentsByMethod.TRANSFERENCIA)}</span>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Efectivo en caja</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Retiros</span>
              <span>
                {preview.retirosTotal > 0 ? "-" : ""}
                {formatCurrency(preview.retirosTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingresos</span>
              <span>{formatCurrency(preview.ingresosTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-medium">
              <span>Efectivo esperado</span>
              <span>{formatCurrency(preview.expectedCash)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm font-medium">
            <span>Efectivo contado</span>
            <span>{formatCurrency(Number(closingCash))}</span>
          </div>

          {hasDifference && (
            <div className="flex flex-col gap-1">
              <p role="alert" className="text-sm text-destructive">
                Diferencia de {formatCurrency(difference)} — captura el motivo.
              </p>
              <Label htmlFor="differenceReason">Motivo de la diferencia</Label>
              <Input
                id="differenceReason"
                value={differenceReason}
                onChange={(e) => setDifferenceReason(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="confirmingPin">PIN de quien autoriza el cierre</Label>
            <Input
              id="confirmingPin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="PIN de un empleado distinto"
              value={confirmingPin}
              onChange={(e) => setConfirmingPin(e.target.value)}
            />
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <Button onClick={handleConfirm} disabled={isPending || !hasCount}>
            {isPending ? "Cerrando…" : "Confirmar cierre"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
