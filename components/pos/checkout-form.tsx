"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PaymentMethod, DiscountType, ManualDiscountReason } from "@prisma/client";
import type { DomicilioOrigen } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn, formatCurrency, posAccentClass, posAccentBorderClass } from "@/lib/utils";
import {
  createSale as createSaleAction,
  closeTab as closeTabAction,
  previewSaleTotal as previewSaleTotalAction,
  type AppliedPromotion,
  type StockShortage,
} from "@/actions/pos";
import { findDiscountCodeByCode as findDiscountCodeByCodeAction, type FoundDiscountCode } from "@/actions/discounts";
import { updateCustomer as updateCustomerAction } from "@/actions/customers";
import type { CustomerOption } from "@/lib/customers";
import { useCartStore, cartLineToSaleItemInput } from "./cart-store";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createSale = withActionErrors(createSaleAction);
const closeTab = withActionErrors(closeTabAction);
const previewSaleTotal = withActionErrors(previewSaleTotalAction);
const findDiscountCodeByCode = withActionErrors(findDiscountCodeByCodeAction);
const updateCustomer = withActionErrors(updateCustomerAction);

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

const discountModes = [
  { value: "NINGUNO", label: "Sin descuento" },
  { value: "CODIGO", label: "Código" },
  { value: "MANUAL", label: "Manual" },
] as const;
type DiscountMode = (typeof discountModes)[number]["value"];

const discountTypeLabels: Record<DiscountType, string> = {
  PORCENTAJE: "% porcentaje",
  MONTO_FIJO: "monto fijo",
  PRECIO_FINAL: "precio final",
};

const manualDiscountReasonLabels: Record<ManualDiscountReason, string> = {
  GIVEAWAY: "Regalo",
  CORTESIA: "Cortesía",
  DESCUENTO_EMPLEADO: "Descuento de empleado",
  OTRO: "Otro",
};

// Mismo cálculo que computeDiscount en actions/pos.ts — solo para mostrar
// una vista previa en el cliente, el servidor es quien decide de verdad.
function previewDiscountAmount(type: DiscountType, value: number, subtotal: number): number {
  switch (type) {
    case "PORCENTAJE":
      return (subtotal * value) / 100;
    case "MONTO_FIJO":
      return value;
    case "PRECIO_FINAL":
      return subtotal - value;
  }
}

// Lo que CartPanel muestra después de cobrar — sobre todo el cambio a
// entregar, que antes desaparecía en cuanto se registraba la venta.
export type SaleReceipt = {
  saleId: string;
  total: number;
  method: PaymentMethod;
  cashReceived: number | null;
  change: number | null;
};

// Descuento/método de pago/confirmar — antes vivía en un <Dialog> flotante
// (CheckoutDialog); ahora es el "modo cobro" de CartPanel, en el mismo
// panel donde ya se arma la comanda, en vez de un popup encima de todo.
// El cliente/domicilio ya no se capturan aquí — CartPanel los pasa como
// prop porque CustomerPicker (un hermano) los captura más arriba, junto
// al selector de tipo de venta.
export function CheckoutForm({
  branchId,
  shiftId,
  employeeId,
  activeTabBaseTotal,
  selectedCustomer,
  domicilioAddress,
  domicilioOrigen,
  onConfirmed,
  onCancel,
}: {
  branchId: string;
  shiftId: string;
  employeeId: string;
  activeTabBaseTotal?: number;
  selectedCustomer: CustomerOption | null;
  domicilioAddress: string;
  domicilioOrigen: DomicilioOrigen;
  onConfirmed: (receipt: SaleReceipt) => void;
  onCancel: () => void;
}) {
  const { lines, subtotal, clear, orderType, tableNumber, activeTabId } = useCartStore();
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [transferNote, setTransferNote] = useState("");

  // El subtotal "de verdad" de esta ronda — lo que sumaría quantity×precio
  // del lado del cliente NO refleja Paquetes/2x1/Día temático (esas
  // promociones solo se resuelven server-side, ver resolveSaleItems/
  // applyPromotions en actions/pos.ts), así que se revalida contra el
  // servidor cada vez que cambia el carrito. Mientras carga, se usa la
  // suma naive como mejor estimado visual, pero "Confirmar venta" se
  // deshabilita hasta tener el valor real — cobrar con un monto que no
  // coincida haría que createSale rechace la venta.
  const [verifiedSubtotal, setVerifiedSubtotal] = useState<number | null>(null);
  // Base para el descuento de código/manual de ESTA ronda — excluye lo
  // que ya haya recibido una promoción automática (mismo criterio que
  // discountableSubtotal en el servidor, para que la vista previa no
  // "regale" un descuento extra sobre una línea ya promocionada). En una
  // cuenta abierta con rondas previas, esto solo cubre la ronda actual —
  // si el combo se compone con el total ya acumulado, el servidor igual
  // valida el monto exacto al cobrar y rechaza un desajuste con seguridad.
  const [verifiedDiscountableSubtotal, setVerifiedDiscountableSubtotal] = useState<number | null>(null);
  const [appliedPromotions, setAppliedPromotions] = useState<AppliedPromotion[]>([]);
  // Insumos que no alcanzan para esta ronda — se advierte y solo se cobra
  // si el cajero confirma "vender de todos modos" (QA-003).
  const [shortages, setShortages] = useState<StockShortage[]>([]);
  // Id del intento de cobro: se reutiliza en reintentos (p. ej. tras un
  // corte de red) para que el servidor nunca registre la venta dos veces;
  // se renueva si cambia la cuenta o después de cobrar.
  const requestIdRef = useRef<string | null>(null);
  useEffect(() => {
    requestIdRef.current = null;
  }, [lines]);
  const [allowShortage, setAllowShortage] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    if (lines.length === 0) {
      setVerifiedSubtotal(0);
      setVerifiedDiscountableSubtotal(0);
      setAppliedPromotions([]);
      setShortages([]);
      return;
    }
    let cancelled = false;
    setIsPreviewLoading(true);
    previewSaleTotal(employeeId, lines.map(cartLineToSaleItemInput))
      .then(({ subtotal: serverSubtotal, discountableSubtotal, appliedPromotions: promos, shortages: missing }) => {
        if (!cancelled) {
          setVerifiedSubtotal(serverSubtotal);
          setVerifiedDiscountableSubtotal(discountableSubtotal);
          setAppliedPromotions(promos);
          setShortages(missing);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVerifiedSubtotal(null);
          setVerifiedDiscountableSubtotal(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, employeeId]);

  const [discountMode, setDiscountMode] = useState<DiscountMode>("NINGUNO");
  const [codeInput, setCodeInput] = useState("");
  const [resolvedCode, setResolvedCode] = useState<FoundDiscountCode | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isCheckingCode, startCheckingCode] = useTransition();

  const [manualType, setManualType] = useState<DiscountType>("PORCENTAJE");
  const [manualValue, setManualValue] = useState("0");
  const [manualReason, setManualReason] = useState<ManualDiscountReason>("CORTESIA");
  const [authorizingPin, setAuthorizingPin] = useState("");

  const [tipMode, setTipMode] = useState<"NINGUNA" | "PORCENTAJE" | "MONTO">("NINGUNA");
  const [tipPercent, setTipPercent] = useState(10);
  const [tipCustom, setTipCustom] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [confirmHighTip, setConfirmHighTip] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rawSubtotal = (verifiedSubtotal ?? subtotal()) + (activeTabBaseTotal ?? 0);
  // Base del descuento: lo "descontable" de esta ronda + lo ya acumulado
  // de rondas previas de la cuenta (que el servidor trata como
  // descontable en su totalidad hasta que se re-deriva al cerrar — ver
  // computeDiscountableSubtotal — así que activeTabBaseTotal se suma tal
  // cual, igual que antes).
  const discountableBase = (verifiedDiscountableSubtotal ?? subtotal()) + (activeTabBaseTotal ?? 0);
  const discountPreview =
    discountMode === "CODIGO" && resolvedCode
      ? previewDiscountAmount(resolvedCode.type, resolvedCode.value, discountableBase)
      : discountMode === "MANUAL"
        ? previewDiscountAmount(manualType, Number(manualValue) || 0, discountableBase)
        : 0;
  const total = Math.max(0, Math.round((rawSubtotal - discountPreview) * 100) / 100);
  const tipValue =
    tipMode === "PORCENTAJE"
      ? Math.round(total * tipPercent) / 100
      : tipMode === "MONTO"
        ? Math.max(0, Math.round((Number(tipCustom) || 0) * 100) / 100)
        : 0;
  const totalToCollect = Math.round((total + tipValue) * 100) / 100;
  // Propina mayor a la mitad de la cuenta: casi siempre es un error de
  // captura (ej. 100000 en vez de 100) — se pide confirmarla (QA-028).
  const isHighTip = total > 0 && tipValue > total / 2;
  const cashReceivedCents = Math.round((Number(cashReceived) || 0) * 100);
  const totalToCollectCents = Math.round(totalToCollect * 100);

  // Mismas reglas que valida computeDiscount en el servidor — aquí solo
  // para avisar antes de intentar cobrar (antes se podía capturar 150% y
  // el botón seguía habilitado con un total de $0.00).
  const manualValueNumber = Number(manualValue) || 0;
  const manualDiscountError =
    discountMode !== "MANUAL"
      ? null
      : manualValueNumber < 0
        ? "El valor no puede ser negativo."
        : manualType === "PORCENTAJE" && manualValueNumber > 100
          ? "El porcentaje no puede ser mayor a 100%."
          : manualType === "MONTO_FIJO" && manualValueNumber > discountableBase
            ? "El descuento no puede ser mayor al subtotal."
            : manualType === "PRECIO_FINAL" && manualValueNumber > rawSubtotal
              ? "El precio final no puede ser mayor al subtotal."
              : null;

  function resetDiscountState() {
    setCodeInput("");
    setResolvedCode(null);
    setCodeError(null);
    setManualValue("0");
    setAuthorizingPin("");
  }

  function handleCheckCode() {
    setCodeError(null);
    setResolvedCode(null);
    startCheckingCode(async () => {
      try {
        const found = await findDiscountCodeByCode({
          employeeId,
          code: codeInput,
          customerId: selectedCustomer?.id,
        });
        setResolvedCode(found);
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : "No se pudo validar el código.");
      }
    });
  }

  function handleConfirm() {
    setError(null);

    // "A domicilio" exige cliente (cambios sección POS) — sin cliente no
    // hay a quién entregarle ni datos de contacto si algo sale mal.
    if (orderType === "DOMICILIO" && !selectedCustomer) {
      setError("Busca o crea un cliente arriba antes de cobrar un pedido a domicilio.");
      return;
    }
    if (orderType === "DOMICILIO" && !domicilioAddress.trim()) {
      setError("Captura el domicilio de entrega (arriba, junto al cliente).");
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const clientRequestId = requestIdRef.current;

    startTransition(async () => {
      try {
        // Domicilio (punto 10): si el cliente ya existía pero cambió el
        // domicilio para esta entrega, se guarda de vuelta.
        if (
          orderType === "DOMICILIO" &&
          selectedCustomer &&
          domicilioAddress.trim() !== (selectedCustomer.address ?? "")
        ) {
          await updateCustomer({
            employeeId,
            customerId: selectedCustomer.id,
            name: selectedCustomer.name,
            // updateCustomer es parcial: solo cambia el domicilio, el resto
            // de los datos del cliente se conserva.
            address: domicilioAddress.trim(),
          });
        }

        const payments = [
          {
            method,
            amount: totalToCollect,
            note: method === "TRANSFERENCIA" ? transferNote.trim() || undefined : undefined,
          },
        ];
        const discountCodeId = discountMode === "CODIGO" ? resolvedCode?.id : undefined;
        const manualDiscount =
          discountMode === "MANUAL"
            ? {
                type: manualType,
                value: Number(manualValue) || 0,
                reason: manualReason,
                authorizingPin,
              }
            : undefined;

        let saleId: string;
        if (activeTabId) {
          // Cerrar una cuenta abierta (ver "cambios para la sección de
          // punto de venta") — si hay productos en el carrito, se agregan
          // como la última ronda en la misma transacción que cobra.
          saleId = activeTabId;
          await closeTab({
            saleId: activeTabId,
            branchId,
            shiftId,
            employeeId,
            items: lines.length > 0 ? lines.map(cartLineToSaleItemInput) : undefined,
            payments,
            tipAmount: tipValue,
            customerId: selectedCustomer?.id,
            discountCodeId,
            manualDiscount,
            allowShortage,
            clientRequestId,
          });
        } else {
          const created = await createSale({
            branchId,
            shiftId,
            employeeId,
            items: lines.map(cartLineToSaleItemInput),
            // El checkout hoy solo soporta un método por venta. El modelo
            // (SalePayment) ya permite pagos divididos — falta la UI.
            payments,
            tipAmount: tipValue,
            orderType,
            tableNumber: orderType === "CONSUMO_LOCAL" ? tableNumber.trim() || undefined : undefined,
            domicilioOrigen: orderType === "DOMICILIO" ? domicilioOrigen : undefined,
            customerId: selectedCustomer?.id,
            discountCodeId,
            manualDiscount,
            allowShortage,
            clientRequestId,
          });
          saleId = created.id;
        }
        const receipt: SaleReceipt = {
          saleId,
          total: totalToCollect,
          method,
          cashReceived: method === "EFECTIVO" ? cashReceivedCents / 100 : null,
          change: method === "EFECTIVO" ? (cashReceivedCents - totalToCollectCents) / 100 : null,
        };
        requestIdRef.current = null;
        clear();
        setAllowShortage(false);
        setDiscountMode("NINGUNO");
        resetDiscountState();
        setTransferNote("");
        setTipMode("NINGUNA");
        setTipCustom("");
        setConfirmHighTip(false);
        setCashReceived("");
        onConfirmed(receipt);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          ← Atrás
        </button>
        <p className="font-semibold">Cobrar</p>
        <span />
      </div>

      {activeTabId && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          Cerrando cuenta de Mesa {tableNumber || "—"} · ya registrado: {formatCurrency(activeTabBaseTotal ?? 0)}
          {lines.length > 0 && ` + esta ronda: ${formatCurrency(subtotal())}`}
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Descuento</p>
        <div className="flex gap-2">
          {discountModes.map((mode) => (
            <button
              aria-pressed={discountMode === mode.value}
              key={mode.value}
              type="button"
              onClick={() => {
                setDiscountMode(mode.value);
                resetDiscountState();
              }}
              className={cn(
                "min-h-11 flex-1 rounded-md border border-border px-3 py-2 text-sm",
                discountMode === mode.value ? posAccentBorderClass : "hover:bg-muted"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {discountMode === "CODIGO" && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setResolvedCode(null);
                }}
                placeholder="ej. VERANO10"
              />
            </div>
            <Button type="button" variant="outline" onClick={handleCheckCode} disabled={isCheckingCode || !codeInput}>
              {isCheckingCode ? "Validando..." : "Validar"}
            </Button>
          </div>
          {codeError && <p role="alert" className="text-sm text-destructive">{codeError}</p>}
          {resolvedCode && (
            <p className="text-sm text-muted-foreground">
              Válido — {discountTypeLabels[resolvedCode.type]}, descuento de {formatCurrency(discountPreview)}
            </p>
          )}
        </div>
      )}

      {discountMode === "MANUAL" && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="manualType">Tipo</Label>
              <Select id="manualType" value={manualType} onChange={(e) => setManualType(e.target.value as DiscountType)}>
                {Object.entries(discountTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex w-28 flex-col gap-1">
              <Label htmlFor="manualValue">Valor</Label>
              <Input
                id="manualValue"
                type="number"
                min="0"
                step={manualType === "PORCENTAJE" ? "1" : "0.01"}
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="manualReason">Motivo</Label>
            <Select
              id="manualReason"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value as ManualDiscountReason)}
            >
              {Object.entries(manualDiscountReasonLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="authorizingPin">PIN de quien autoriza</Label>
            <Input
              id="authorizingPin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="PIN de un empleado con permiso"
              value={authorizingPin}
              onChange={(e) => setAuthorizingPin(e.target.value)}
            />
          </div>
          {manualDiscountError && <p role="alert" className="text-sm text-destructive">{manualDiscountError}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(rawSubtotal)}</span>
        </div>
        {appliedPromotions.map((promo) => (
          <div key={promo.name} className="flex items-center justify-between text-emerald-700">
            <span>Promoción: {promo.name}</span>
            <span>ya incluye −{formatCurrency(promo.saving)}</span>
          </div>
        ))}
        {discountPreview > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Descuento</span>
            <span>-{formatCurrency(discountPreview)}</span>
          </div>
        )}
        {tipValue > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Propina</span>
            <span>+{formatCurrency(tipValue)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-base font-semibold">Total</span>
          <span className="text-3xl font-bold">{formatCurrency(totalToCollect)}</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Propina</p>
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={tipMode === "NINGUNA"}
            type="button"
            onClick={() => setTipMode("NINGUNA")}
            className={cn(
              "min-h-11 rounded-md border border-border px-3 py-2 text-sm",
              tipMode === "NINGUNA" ? posAccentBorderClass : "hover:bg-muted"
            )}
          >
            Sin propina
          </button>
          {[10, 15, 20].map((pct) => (
            <button
              aria-pressed={tipMode === "PORCENTAJE" && tipPercent === pct}
              key={pct}
              type="button"
              onClick={() => {
                setTipMode("PORCENTAJE");
                setTipPercent(pct);
              }}
              className={cn(
                "min-h-11 rounded-md border border-border px-3 py-2 text-sm",
                tipMode === "PORCENTAJE" && tipPercent === pct ? posAccentBorderClass : "hover:bg-muted"
              )}
            >
              {pct}%
            </button>
          ))}
          <button
            aria-pressed={tipMode === "MONTO"}
            type="button"
            onClick={() => setTipMode("MONTO")}
            className={cn(
              "min-h-11 rounded-md border border-border px-3 py-2 text-sm",
              tipMode === "MONTO" ? posAccentBorderClass : "hover:bg-muted"
            )}
          >
            Monto
          </button>
        </div>
        {tipMode === "MONTO" && (
          <Input
            className="mt-2"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Monto de la propina"
            aria-label="Monto de la propina"
            value={tipCustom}
            onChange={(e) => {
              setTipCustom(e.target.value);
              setConfirmHighTip(false);
            }}
          />
        )}
        {tipMode === "MONTO" && Number(tipCustom) < 0 && (
          <p role="alert" className="mt-1 text-xs text-destructive">La propina no puede ser negativa.</p>
        )}
        {isHighTip && (
          <label className="mt-2 flex items-center gap-2 text-sm text-destructive">
            <input type="checkbox" checked={confirmHighTip} onChange={(e) => setConfirmHighTip(e.target.checked)} />
            Confirmo una propina de {formatCurrency(tipValue)} (más de la mitad de la cuenta)
          </label>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Método de pago</p>
        <div className="flex gap-2">
          {paymentMethods.map((m) => (
            <button
              aria-pressed={method === m.value}
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className={cn(
                "min-h-11 flex-1 rounded-md border border-border px-3 py-2 text-sm",
                method === m.value ? posAccentBorderClass : "hover:bg-muted"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {method === "TRANSFERENCIA" && (
          <Input
            className="mt-2"
            value={transferNote}
            onChange={(e) => setTransferNote(e.target.value)}
            placeholder="Nota (banco, referencia, etc.)"
            aria-label="Nota de la transferencia"
          />
        )}
      </div>

      {method === "EFECTIVO" && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="cash-received">Recibido</Label>
              <Input
                id="cash-received"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              // Mientras se calcula el total "Exacto" capturaría $0.
              disabled={isPreviewLoading || verifiedSubtotal === null}
              onClick={() => setCashReceived(totalToCollect.toFixed(2))}
            >
              Exacto
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCashReceived("")}>
              Limpiar
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[20, 50, 100, 200, 500, 1000].map((bill) => (
              <button
                key={bill}
                type="button"
                onClick={() => setCashReceived(String((Number(cashReceived) || 0) + bill))}
                className="min-h-10 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                +${bill}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cambio a entregar</span>
            <span className="text-lg font-semibold">
              {cashReceived !== "" && cashReceivedCents >= totalToCollectCents
                ? formatCurrency((cashReceivedCents - totalToCollectCents) / 100)
                : "—"}
            </span>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {shortages.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p role="alert" className="font-medium text-destructive">Insumos insuficientes según el inventario</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {shortages.map((s) => (
              <li key={s.ingredientId}>
                {s.name}: faltan {s.missing} {s.unit}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowShortage}
              onChange={(e) => setAllowShortage(e.target.checked)}
            />
            Vender de todos modos (el inventario quedará en negativo)
          </label>
        </div>
      )}

      <Button
        className={posAccentClass}
        onClick={handleConfirm}
        disabled={
          isPending ||
          isPreviewLoading ||
          (shortages.length > 0 && !allowShortage) ||
          (isHighTip && !confirmHighTip) ||
          (tipMode === "MONTO" && Number(tipCustom) < 0) ||
          verifiedSubtotal === null ||
          (lines.length === 0 && !activeTabId) ||
          (discountMode === "CODIGO" && !resolvedCode) ||
          (discountMode === "MANUAL" && (!authorizingPin || manualDiscountError !== null)) ||
          (method === "EFECTIVO" && (cashReceived === "" || cashReceivedCents < totalToCollectCents))
        }
      >
        {isPending ? "Procesando..." : isPreviewLoading ? "Calculando total..." : "Confirmar venta"}
      </Button>
    </div>
  );
}
