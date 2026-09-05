"use client";

import { useState, useTransition } from "react";
import { PaymentMethod, DiscountType, ManualDiscountReason } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { createSale } from "@/actions/pos";
import { findDiscountCodeByCode, type FoundDiscountCode } from "@/actions/discounts";
import type { CustomerOption } from "@/lib/customers";
import { useCartStore } from "./cart-store";

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

export function CheckoutDialog({
  open,
  onOpenChange,
  branchId,
  shiftId,
  employeeId,
  customers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  shiftId: string;
  employeeId: string;
  customers: CustomerOption[];
}) {
  const { lines, subtotal, clear } = useCartStore();
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [customerId, setCustomerId] = useState("");

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

  const rawSubtotal = subtotal();
  const discountPreview =
    discountMode === "CODIGO" && resolvedCode
      ? previewDiscountAmount(resolvedCode.type, resolvedCode.value, rawSubtotal)
      : discountMode === "MANUAL"
        ? previewDiscountAmount(manualType, Number(manualValue) || 0, rawSubtotal)
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
        const found = await findDiscountCodeByCode({ employeeId, code: codeInput });
        setResolvedCode(found);
      } catch (err) {
        setCodeError(err instanceof Error ? err.message : "No se pudo validar el código.");
      }
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await createSale({
          branchId,
          shiftId,
          employeeId,
          items: lines.map((line) => ({
            productVariantId: line.productVariantId,
            quantity: line.quantity,
            modifierOptionIds: line.modifiers.map((m) => m.modifierOptionId),
          })),
          // El checkout hoy solo soporta un método por venta. El modelo
          // (SalePayment) ya permite pagos divididos — falta la UI.
          payments: [{ method, amount: total }],
          customerId: customerId || undefined,
          discountCodeId: discountMode === "CODIGO" ? resolvedCode?.id : undefined,
          manualDiscount:
            discountMode === "MANUAL"
              ? {
                  type: manualType,
                  value: Number(manualValue) || 0,
                  reason: manualReason,
                  authorizingPin,
                }
              : undefined,
        });
        clear();
        setCustomerId("");
        setDiscountMode("NINGUNO");
        resetDiscountState();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cobrar">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="customer">Cliente (opcional)</Label>
          <Select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Sin cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </option>
            ))}
          </Select>
        </div>

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
                className={
                  "flex-1 rounded-md border border-border px-3 py-2 text-sm " +
                  (discountMode === mode.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted")
                }
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
                Válido — {discountTypeLabels[resolvedCode.type]}, descuento de{" "}
                {formatCurrency(discountPreview)}
              </p>
            )}
          </div>
        )}

        {discountMode === "MANUAL" && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="manualType">Tipo</Label>
                <Select
                  id="manualType"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as DiscountType)}
                >
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
                  step="0.01"
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
                className={
                  "flex-1 rounded-md border border-border px-3 py-2 text-sm " +
                  (method === m.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleConfirm}
          disabled={
            isPending ||
            lines.length === 0 ||
            (discountMode === "CODIGO" && !resolvedCode) ||
            (discountMode === "MANUAL" && !authorizingPin)
          }
        >
          {isPending ? "Procesando..." : "Confirmar venta"}
        </Button>
      </div>
    </Dialog>
  );
}
