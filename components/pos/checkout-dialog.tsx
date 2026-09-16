"use client";

import { useEffect, useState, useTransition } from "react";
import { PaymentMethod, DiscountType, ManualDiscountReason, DomicilioOrigen } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn, formatCurrency, posAccentClass, posAccentBorderClass } from "@/lib/utils";
import { createSale, closeTab } from "@/actions/pos";
import { findDiscountCodeByCode, type FoundDiscountCode } from "@/actions/discounts";
import { createCustomer, updateCustomer } from "@/actions/customers";
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

export function CheckoutDialog({
  open,
  onOpenChange,
  branchId,
  shiftId,
  employeeId,
  customers,
  activeTabBaseTotal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  shiftId: string;
  employeeId: string;
  customers: CustomerOption[];
  // Total ya registrado de la cuenta abierta que se está cobrando (rondas
  // anteriores) — el carrito actual es solo la última ronda, si hay.
  activeTabBaseTotal?: number;
}) {
  const {
    lines,
    subtotal,
    clear,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    activeTabId,
    setActiveTabId,
  } = useCartStore();
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [transferNote, setTransferNote] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerListOpen, setCustomerListOpen] = useState(false);
  // Clientes creados desde este mismo diálogo (punto 10/11) — el prop
  // `customers` viene del server component padre y no se refresca solo;
  // se mezclan localmente para que aparezcan de inmediato en esta venta.
  const [localCustomers, setLocalCustomers] = useState<CustomerOption[]>([]);
  const allCustomers = [...customers, ...localCustomers];

  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [isCreatingCustomer, startCreatingCustomer] = useTransition();

  // Domicilio (punto 10): dirección editable, precargada de la del
  // cliente seleccionado — se guarda de vuelta al cliente al confirmar la
  // venta si cambió.
  const [domicilioAddress, setDomicilioAddress] = useState("");
  // Origen del pedido a domicilio (teléfono del negocio vs. app de
  // delivery) — solo aplica con orderType = DOMICILIO.
  const [domicilioOrigen, setDomicilioOrigen] = useState<DomicilioOrigen>("TELEFONO");

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

  const selectedCustomer = allCustomers.find((c) => c.id === customerId) ?? null;
  const filteredCustomers = customerQuery.trim()
    ? allCustomers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
          c.phone?.includes(customerQuery) ||
          (c.loyaltyCode && c.loyaltyCode === customerQuery.trim())
      )
    : allCustomers;

  useEffect(() => {
    setDomicilioAddress(selectedCustomer?.address ?? "");
  }, [selectedCustomer]);

  function handleSelectCustomer(customer: CustomerOption) {
    setCustomerId(customer.id);
    setCustomerQuery(customer.name);
    setCustomerListOpen(false);
    setShowNewCustomerForm(false);
  }

  function handleClearCustomer() {
    setCustomerId("");
    setCustomerQuery("");
  }

  function handleOpenNewCustomerForm() {
    setNewCustomerName(customerQuery.trim());
    setNewCustomerPhone("");
    setNewCustomerAddress("");
    setNewCustomerError(null);
    setShowNewCustomerForm(true);
    setCustomerListOpen(false);
  }

  function handleCreateCustomer() {
    setNewCustomerError(null);
    const name = newCustomerName.trim();
    if (!name) {
      setNewCustomerError("El nombre del cliente es obligatorio.");
      return;
    }
    startCreatingCustomer(async () => {
      try {
        const created = await createCustomer({
          employeeId,
          name,
          phone: newCustomerPhone.trim() || undefined,
          address: orderType === "DOMICILIO" ? newCustomerAddress.trim() || undefined : undefined,
        });
        const option: CustomerOption = {
          id: created.id,
          name,
          phone: newCustomerPhone.trim() || null,
          address: orderType === "DOMICILIO" ? newCustomerAddress.trim() || null : null,
          loyaltyCode: null,
        };
        setLocalCustomers((prev) => [...prev, option]);
        handleSelectCustomer(option);
      } catch (err) {
        setNewCustomerError(err instanceof Error ? err.message : "No se pudo crear el cliente.");
      }
    });
  }

  const rawSubtotal = subtotal() + (activeTabBaseTotal ?? 0);
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
            customerId: customerId || undefined,
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
            customerId: customerId || undefined,
            discountCodeId,
            manualDiscount,
          });
        }
        clear();
        handleClearCustomer();
        setDiscountMode("NINGUNO");
        resetDiscountState();
        setOrderType("PARA_LLEVAR");
        setTableNumber("");
        setActiveTabId(null);
        setDomicilioOrigen("TELEFONO");
        setTransferNote("");
        setLocalCustomers([]);
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Cobrar">
      <div className="flex flex-col gap-4">
        {activeTabId && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            Cerrando cuenta de Mesa {tableNumber || "—"} · ya registrado:{" "}
            {formatCurrency(activeTabBaseTotal ?? 0)}
            {lines.length > 0 && ` + esta ronda: ${formatCurrency(subtotal())}`}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="customer">Cliente (opcional)</Label>
          <div className="relative">
            <Input
              id="customer"
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                setCustomerId("");
                setCustomerListOpen(true);
              }}
              onFocus={() => setCustomerListOpen(true)}
              onBlur={() => setTimeout(() => setCustomerListOpen(false), 150)}
              placeholder="Buscar por nombre, teléfono o código de tarjeta…"
              autoComplete="off"
            />
            {customerListOpen && (filteredCustomers.length > 0 || customerQuery.trim()) && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-background shadow-md">
                {filteredCustomers.map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectCustomer(customer)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {customer.name}
                      {customer.phone && (
                        <span className="text-muted-foreground"> · {customer.phone}</span>
                      )}
                    </button>
                  </li>
                ))}
                {customerQuery.trim() && (
                  <li>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleOpenNewCustomerForm}
                      className="block w-full border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                    >
                      + Crear &ldquo;{customerQuery.trim()}&rdquo; como cliente nuevo
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          {selectedCustomer && (
            <p className="text-xs text-muted-foreground">
              Seleccionado: {selectedCustomer.name}{" "}
              <button type="button" onClick={handleClearCustomer} className="underline">
                quitar
              </button>
            </p>
          )}

          {showNewCustomerForm && (
            <div className="mt-1 flex flex-col gap-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Cliente nuevo</p>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Nombre"
              />
              <Input
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="Teléfono (opcional)"
              />
              {orderType === "DOMICILIO" && (
                <Input
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                  placeholder="Domicilio de entrega"
                />
              )}
              {newCustomerError && <p className="text-sm text-destructive">{newCustomerError}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateCustomer}
                  disabled={isCreatingCustomer}
                >
                  {isCreatingCustomer ? "Creando…" : "Crear y seleccionar"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowNewCustomerForm(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {orderType === "DOMICILIO" && selectedCustomer && (
            <div className="mt-1 flex flex-col gap-2 rounded-md border border-border p-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Teléfono:</span>{" "}
                {selectedCustomer.phone ?? "sin registrar"}
              </p>
              <div className="flex flex-col gap-1">
                <Label htmlFor="domicilio-address">Domicilio de entrega</Label>
                <Input
                  id="domicilio-address"
                  value={domicilioAddress}
                  onChange={(e) => setDomicilioAddress(e.target.value)}
                  placeholder="Calle, número, colonia…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>¿Cómo llegó el pedido?</Label>
                <div className="flex gap-2">
                  {(
                    [
                      { value: "TELEFONO" as const, label: "Teléfono del negocio" },
                      { value: "APP" as const, label: "App de delivery" },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDomicilioOrigen(opt.value)}
                      className={cn(
                        "flex-1 rounded-md border border-border px-3 py-1.5 text-sm",
                        domicilioOrigen === opt.value ? posAccentBorderClass : "hover:bg-muted"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {orderType === "DOMICILIO" && !selectedCustomer && (
            <p className="text-xs text-destructive">
              Busca o crea un cliente arriba — a domicilio necesita saber a quién entregarle.
            </p>
          )}
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
