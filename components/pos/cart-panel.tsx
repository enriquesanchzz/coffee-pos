"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Coffee, Minus, Plus, Trash2, X } from "lucide-react";
import type { SaleOrderType, DomicilioOrigen } from "@prisma/client";
import { useCartStore, lineUnitPrice, cartLineToSaleItemInput } from "./cart-store";
import { openTab as openTabAction, addItemsToTab as addItemsToTabAction, removeTabItem as removeTabItemAction, updateTabItemQuantity as updateTabItemQuantityAction, type OpenTabDetail } from "@/actions/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency, posAccentClass, unitLabel } from "@/lib/utils";
import { CustomerPicker } from "./customer-picker";
import { CheckoutForm, type SaleReceipt } from "./checkout-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { isShortageError } from "@/lib/stock";
import type { CustomerOption } from "@/lib/customers";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const openTab = withActionErrors(openTabAction);
const addItemsToTab = withActionErrors(addItemsToTabAction);
const removeTabItem = withActionErrors(removeTabItemAction);
const updateTabItemQuantity = withActionErrors(updateTabItemQuantityAction);

const temperatureLabels: Record<string, string> = {
  CALIENTE: "Caliente",
  FRIO: "Frío",
  FRAPPE: "Frappé",
};

// "Mesa" = CONSUMO_LOCAL (el valor del enum no cambió, solo la etiqueta —
// punto 8, "Mejoras avanzadas de POS").
const orderTypes: { value: SaleOrderType; label: string }[] = [
  { value: "CONSUMO_LOCAL", label: "Mesa" },
  { value: "PARA_LLEVAR", label: "Para llevar" },
  { value: "DOMICILIO", label: "A domicilio" },
];

export function CartPanel({
  branchId,
  shiftId,
  employeeId,
  customers,
  activeTabSummary,
  onTabChanged,
}: {
  branchId: string;
  shiftId: string;
  employeeId: string;
  customers: CustomerOption[];
  // Resumen de la cuenta que se está retomando (null = carrito normal).
  activeTabSummary: OpenTabDetail | null;
  onTabChanged: () => void;
}) {
  const {
    lines,
    incrementLine,
    decrementLine,
    removeLine,
    subtotal,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    activeTabId,
    setActiveTabId,
  } = useCartStore();
  const [tabError, setTabError] = useState<string | null>(null);
  const [isSavingTab, startSavingTab] = useTransition();
  // Item de la cuenta ya registrada que se está quitando/ajustando ahora
  // mismo — deshabilita sus botones para no disparar dos correcciones a
  // la vez sobre la misma línea.
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [registeredError, setRegisteredError] = useState<string | null>(null);

  // "Cobrar" ya no abre un <Dialog> flotante — el panel de cobro (antes
  // CheckoutDialog) ahora es un segundo "modo" de este mismo panel, que
  // reemplaza la lista del carrito en el mismo lugar de la pantalla.
  const [view, setView] = useState<"cart" | "checkout">("cart");

  // Cliente/domicilio viven aquí (no en CustomerPicker ni en CheckoutForm)
  // porque ambos son hermanos que los necesitan: CustomerPicker los
  // captura, CheckoutForm los lee al confirmar la venta.
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [domicilioAddress, setDomicilioAddress] = useState("");
  const [domicilioOrigen, setDomicilioOrigen] = useState<DomicilioOrigen>("TELEFONO");

  function handleSelectCustomer(customer: CustomerOption | null) {
    setSelectedCustomer(customer);
  }

  // Resumen de la última venta cobrada — se queda visible (sobre todo el
  // cambio a entregar) hasta que el cajero lo cierra o cobra otra venta.
  const [lastReceipt, setLastReceipt] = useState<SaleReceipt | null>(null);

  function handleConfirmed(receipt: SaleReceipt) {
    setLastReceipt(receipt);
    setView("cart");
    setSelectedCustomer(null);
    setDomicilioAddress("");
    setDomicilioOrigen("TELEFONO");
    setOrderType("PARA_LLEVAR");
    setTableNumber("");
    setActiveTabId(null);
  }

  // Advertencia de insumos insuficientes al dejar/agregar a una cuenta
  // abierta: el servidor la rechaza con un mensaje que empieza con
  // SHORTAGE_ERROR_PREFIX y aquí se ofrece reintentar confirmando.
  const [shortageMessage, setShortageMessage] = useState<string | null>(null);

  function handleLeaveOpen(allowShortage = false) {
    setTabError(null);
    setShortageMessage(null);
    if (lines.length === 0) return;

    startSavingTab(async () => {
      try {
        const items = lines.map(cartLineToSaleItemInput);
        if (activeTabId) {
          await addItemsToTab({ saleId: activeTabId, branchId, shiftId, employeeId, items, allowShortage });
        } else {
          if (!tableNumber.trim()) {
            setTabError("Captura el número de mesa.");
            return;
          }
          await openTab({ branchId, shiftId, employeeId, tableNumber, items, allowShortage });
        }
        useCartStore.getState().clear();
        setActiveTabId(null);
        setTableNumber("");
        onTabChanged();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo dejar la cuenta abierta.";
        if (isShortageError(message)) {
          setShortageMessage(message);
        } else {
          setTabError(message);
        }
      }
    });
  }

  async function handleRemoveRegistered(saleItemId: string) {
    setRegisteredError(null);
    setPendingItemId(saleItemId);
    try {
      await removeTabItem({ saleItemId, branchId, shiftId, employeeId });
      onTabChanged();
    } catch (err) {
      setRegisteredError(err instanceof Error ? err.message : "No se pudo quitar el producto.");
    } finally {
      setPendingItemId(null);
    }
  }

  async function handleAdjustRegistered(saleItemId: string, newQuantity: number) {
    setRegisteredError(null);
    if (newQuantity <= 0) return handleRemoveRegistered(saleItemId);
    setPendingItemId(saleItemId);
    try {
      await updateTabItemQuantity({ saleItemId, branchId, shiftId, employeeId, quantity: newQuantity });
      onTabChanged();
    } catch (err) {
      setRegisteredError(err instanceof Error ? err.message : "No se pudo ajustar la cantidad.");
    } finally {
      setPendingItemId(null);
    }
  }

  if (view === "checkout") {
    return (
      <div className="flex h-full flex-col overflow-y-auto border-t border-border md:border-l md:border-t-0">
        <CheckoutForm
          branchId={branchId}
          shiftId={shiftId}
          employeeId={employeeId}
          activeTabBaseTotal={activeTabSummary?.total}
          selectedCustomer={selectedCustomer}
          domicilioAddress={domicilioAddress}
          domicilioOrigen={domicilioOrigen}
          onConfirmed={handleConfirmed}
          onCancel={() => setView("cart")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-border md:border-l md:border-t-0">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <p className="font-semibold">Cuenta actual</p>
        <div className="flex gap-1.5">
          {orderTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setOrderType(type.value)}
              className={cn(
                "flex-1 rounded-full border border-border px-2 py-1.5 text-xs font-medium",
                orderType === type.value ? posAccentClass : "hover:bg-muted"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
        {orderType === "CONSUMO_LOCAL" && (
          <div className="flex flex-col gap-1">
          <Label htmlFor="table-number">Número de mesa</Label>
          <Input
            id="table-number"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="Número de mesa"
            className="h-9"
            disabled={Boolean(activeTabId)}
          />
          </div>
        )}
        <CustomerPicker
          customers={customers}
          employeeId={employeeId}
          orderType={orderType}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={handleSelectCustomer}
          domicilioAddress={domicilioAddress}
          onDomicilioAddressChange={setDomicilioAddress}
          domicilioOrigen={domicilioOrigen}
          onDomicilioOrigenChange={setDomicilioOrigen}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {lastReceipt && (
          <div
            role="status"
            className="mb-3 flex items-start gap-3 rounded-xl border border-emerald-600/40 bg-emerald-600/10 p-3"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-700" />
            <div className="flex flex-1 flex-col gap-0.5 text-sm">
              <p className="font-semibold">Venta registrada · {formatCurrency(lastReceipt.total)}</p>
              {lastReceipt.change !== null ? (
                <>
                  <p className="text-muted-foreground">
                    Recibido {formatCurrency(lastReceipt.cashReceived ?? 0)}
                  </p>
                  <p className="text-lg font-bold">Cambio a entregar: {formatCurrency(lastReceipt.change)}</p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Pagado con {lastReceipt.method === "TARJETA" ? "tarjeta" : "transferencia"}.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setLastReceipt(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Cerrar resumen de venta"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {activeTabSummary && (
          <div className="mb-4 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ya registrado en la cuenta — revisa con el cliente antes de cobrar
            </p>
            {registeredError && <p className="text-xs text-destructive">{registeredError}</p>}
            {activeTabSummary.items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Todavía no hay nada registrado (se quitó todo) — la cuenta sigue abierta.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {activeTabSummary.items.map((item) => {
                const isPending = pendingItemId === item.id;
                return (
                  <li key={item.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {item.productName} · {item.productVariantName}
                          {item.temperature && ` · ${temperatureLabels[item.temperature]}`}
                        </p>
                        {item.modifierNames.length > 0 && (
                          <p className="text-xs text-muted-foreground">{item.modifierNames.join(", ")}</p>
                        )}
                        {item.notes && <p className="text-xs italic text-muted-foreground">“{item.notes}”</p>}
                      </div>
                      <button
                        onClick={() => handleRemoveRegistered(item.id)}
                        disabled={isPending}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 rounded-full"
                          disabled={isPending}
                          onClick={() => handleAdjustRegistered(item.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 rounded-full"
                          disabled={isPending}
                          onClick={() => handleAdjustRegistered(item.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="text-sm font-medium">{formatCurrency(item.lineTotal)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-right text-xs text-muted-foreground">
              Ya registrado: {formatCurrency(activeTabSummary.total)}
            </p>
            <div className="border-t border-border pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ronda actual
            </div>
          </div>
        )}

        {lines.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Selecciona productos del catálogo para agregarlos aquí.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li key={line.lineId} className="flex gap-3 rounded-xl border border-border p-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={line.imageUrl} alt={line.productName} className="h-full w-full object-cover" />
                ) : (
                  <Coffee className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {line.productName} · {line.variantName}
                    </p>
                    {(line.modifiers.length > 0 || line.extraIngredients.length > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          ...line.modifiers.map((m) => m.name),
                          ...line.extraIngredients.map((e) => `+ ${e.name} (${e.quantity} ${unitLabel(e.unit)})`),
                        ].join(", ")}
                      </p>
                    )}
                    {line.notes && (
                      <p className="text-xs italic text-muted-foreground">“{line.notes}”</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeLine(line.lineId)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 rounded-full"
                      onClick={() => decrementLine(line.lineId)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 rounded-full"
                      onClick={() => incrementLine(line.lineId)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-sm font-medium">
                    {formatCurrency(lineUnitPrice(line) * line.quantity)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm font-medium">Total{activeTabSummary && " (esta ronda)"}</span>
          <span className="text-2xl font-bold">{formatCurrency(subtotal())}</span>
        </div>
        {tabError && <p className="mb-2 text-xs text-destructive">{tabError}</p>}
        <div className="flex gap-2">
          {orderType === "CONSUMO_LOCAL" && (
            <Button
              variant="outline"
              className="flex-1"
              disabled={lines.length === 0 || isSavingTab}
              onClick={() => handleLeaveOpen()}
            >
              {isSavingTab ? "Guardando..." : activeTabId ? "Agregar a la cuenta" : "Dejar cuenta abierta"}
            </Button>
          )}
          <Button
            className={cn("flex-1", posAccentClass)}
            disabled={lines.length === 0 && !activeTabId}
            onClick={() => {
              setLastReceipt(null);
              setView("checkout");
            }}
          >
            Cobrar
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={shortageMessage !== null}
        title="Insumos insuficientes"
        message={
          <>
            <p>{shortageMessage}</p>
            <p className="mt-2">Si continúas, el inventario de esos insumos quedará en negativo.</p>
          </>
        }
        confirmLabel="Registrar de todos modos"
        onConfirm={() => handleLeaveOpen(true)}
        onCancel={() => setShortageMessage(null)}
      />
    </div>
  );
}
