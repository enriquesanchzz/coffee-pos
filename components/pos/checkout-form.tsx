"use client";

import { useEffect, useState, useTransition } from "react";
import { PaymentMethod, DiscountType, ManualDiscountReason, type CustomerGender } from "@prisma/client";
import type { DomicilioOrigen } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn, formatCurrency, posAccentClass, posAccentBorderClass } from "@/lib/utils";
import { createSale, closeTab, previewSaleTotal } from "@/actions/pos";
import { findDiscountCodeByCode, type FoundDiscountCode } from "@/actions/discounts";
import { updateCustomer } from "@/actions/customers";
import type { CustomerOption } from "@/lib/customers";
import { useCartStore, cartLineToSaleItemInput } from "./cart-store";

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
  onConfirmed: () => void;
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
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    if (lines.length === 0) {
      setVerifiedSubtotal(0);
      setVerifiedDiscountableSubtotal(0);
      return;
    }
    let cancelled = false;
    setIsPreviewLoading(true);
    previewSaleTotal(employeeId, lines.map(cartLineToSaleItemInput))
      .then(({ subtotal: serverSubtotal, discountableSubtotal }) => {
        if (!cancelled) {
          setVerifiedSubtotal(serverSubtotal);
          setVerifiedDiscountableSubtotal(discountableSubtotal);
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
  const total = Math.max(0, rawSubtotal - discountPreview);

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
            phone: selectedCustomer.phone ?? undefined,
            address: domicilioAddress.trim() || undefined,
            // updateCustomer reemplaza el registro completo — sin
            // reenviar estos dos, actualizar solo la dirección los
            // borraría (ver nota en lib/customers.ts CustomerOption).
            birthDate: selectedCustomer.birthDate ?? undefined,
            gender: (selectedCustomer.gender as CustomerGender | null) ?? undefined,
          });
        }

        const payments = [
          {
            method,
            amount: total,
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

        if (activeTabId) {
          // Cerrar una cuenta abierta (ver "cambios para la sección de
          // punto de venta") — si hay productos en el carrito, se agregan
          // como la última ronda en la misma transacción que cobra.
          await closeTab({
            saleId: activeTabId,
            branchId,
            shiftId,
            employeeId,
            items: lines.length > 0 ? lines.map(cartLineToSaleItemInput) : undefined,
            payments,
            customerId: selectedCustomer?.id,
            discountCodeId,
            manualDiscount,
          });
        } else {
          await createSale({
            branchId,
            shiftId,
            employeeId,
            items: lines.map(cartLineToSaleItemInput),
            // El checkout hoy solo soporta un método por venta. El modelo
            // (SalePayment) ya permite pagos divididos — falta la UI.
            payments,
            orderType,
            tableNumber: orderType === "CONSUMO_LOCAL" ? tableNumber.trim() || undefined : undefined,
            domicilioOrigen: orderType === "DOMICILIO" ? domicilioOrigen : undefined,
            customerId: selectedCustomer?.id,
            discountCodeId,
            manualDiscount,
          });
        }
        clear();
        setDiscountMode("NINGUNO");
        resetDiscountState();
        setTransferNote("");
        onConfirmed();
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
              key={mode.value}
              type="button"
              onClick={() => {
                setDiscountMode(mode.value);
                resetDiscountState();
              }}
              className={cn(
                "flex-1 rounded-md border border-border px-3 py-2 text-sm",
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
          {codeError && <p className="text-sm text-destructive">{codeError}</p>}
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
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(rawSubtotal)}</span>
        </div>
        {discountPreview > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Descuento</span>
            <span>-{formatCurrency(discountPreview)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Método de pago</p>
        <div className="flex gap-2">
          {paymentMethods.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className={cn(
                "flex-1 rounded-md border border-border px-3 py-2 text-sm",
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
          />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className={posAccentClass}
        onClick={handleConfirm}
        disabled={
          isPending ||
          isPreviewLoading ||
          verifiedSubtotal === null ||
          (lines.length === 0 && !activeTabId) ||
          (discountMode === "CODIGO" && !resolvedCode) ||
          (discountMode === "MANUAL" && !authorizingPin)
        }
      >
        {isPending ? "Procesando..." : isPreviewLoading ? "Calculando total..." : "Confirmar venta"}
      </Button>
    </div>
  );
}
