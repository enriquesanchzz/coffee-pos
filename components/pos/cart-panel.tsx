"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Coffee, LogOut, Minus, Plus, Trash2, XCircle } from "lucide-react";
import type { SaleOrderType, DomicilioOrigen } from "@prisma/client";
import { useCartStore, lineUnitPrice, cartLineToSaleItemInput } from "./cart-store";
import { openTab as openTabAction, addItemsToTab as addItemsToTabAction, removeTabItem as removeTabItemAction, updateTabItemQuantity as updateTabItemQuantityAction, type OpenTabDetail, type OpenTabItem } from "@/actions/pos";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency, posAccentClass, unitLabel } from "@/lib/utils";
import { CustomerPicker } from "./customer-picker";
import { CheckoutForm, type SaleReceipt } from "./checkout-form";
import { ReceiptDialog, type TabConfirmation } from "./receipt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CancelSaleDialog } from "@/components/caja/cancel-sale-dialog";
import type { ShiftSaleRow } from "@/lib/shift";
import { isShortageError } from "@/lib/stock";
import { isAuthorizationRequiredError } from "@/lib/tab-corrections";
import { Dialog } from "@/components/ui/dialog";
import type { CustomerOption } from "@/lib/customers";
import { findAllergyConflicts } from "@/lib/allergens";
import { Alert } from "@/components/ui/alert";
import { withActionErrors, NetworkError } from "@/lib/action-result";
import { randomId } from "@/lib/id";

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
  allergensByVariant,
  allergenSuggestions,
  activeTabSummary,
  onTabChanged,
}: {
  branchId: string;
  shiftId: string;
  employeeId: string;
  customers: CustomerOption[];
  allergensByVariant: Record<string, string[]>;
  allergenSuggestions: string[];
  // Resumen de la cuenta que se está retomando (null = carrito normal).
  activeTabSummary: OpenTabDetail | null;
  onTabChanged: () => void;
}) {
  const {
    lines,
    incrementLine,
    decrementLine,
    removeLine,
    restoreLine,
    subtotal,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    activeTabId,
    setActiveTabId,
  } = useCartStore();
  const notify = useToast();
  const [tabError, setTabError] = useState<string | null>(null);
  const [isSavingTab, startSavingTab] = useTransition();
  // Id de este intento de "dejar cuenta abierta"/"agregar ronda" (ver
  // clientRequestId en checkout-form.tsx): se reutiliza en reintentos para
  // que el servidor nunca lo aplique dos veces. Se reinicia si cambia el
  // carrito o la mesa/cuenta activa.
  const tabRequestIdRef = useRef<string | null>(null);
  // Conserva el allowShortage del intento que falló por red, para que el
  // reintento automático mande exactamente lo mismo (no vuelva a mostrar
  // la advertencia de faltantes si el cajero ya la había confirmado).
  const tabRetryAllowShortageRef = useRef(false);
  const [tabOfflineRetry, setTabOfflineRetry] = useState(false);
  useEffect(() => {
    tabRequestIdRef.current = null;
    setTabOfflineRetry(false);
  }, [lines, activeTabId]);
  // Item de la cuenta ya registrada que se está quitando/ajustando ahora
  // mismo — deshabilita sus botones para no disparar dos correcciones a
  // la vez sobre la misma línea.
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [registeredError, setRegisteredError] = useState<string | null>(null);
  // Corrección de un producto con más de unos minutos en la cuenta: el
  // servidor pide el PIN de un gerente (ver authorizeTabCorrection en
  // actions/pos.ts) y aquí se captura para reintentarla.
  const [authRequest, setAuthRequest] = useState<{
    item: OpenTabItem;
    newQuantity: number | null; // null = quitar
    message: string;
  } | null>(null);
  const [authPin, setAuthPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthorizing, startAuthorizing] = useTransition();

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

  // Al retomar una cuenta, el cliente (y su domicilio) pasan a ser los de
  // ESA cuenta — o ninguno. Sin esto, pasar de la cuenta de Ana a otra sin
  // cliente le abonaba a Ana los puntos de la segunda. Solo al cambiar de
  // cuenta: un cliente elegido a mano se respeta mientras se siga en ella.
  const shownTabId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTabSummary || activeTabSummary.id !== activeTabId) return;
    if (shownTabId.current === activeTabSummary.id) return;
    shownTabId.current = activeTabSummary.id;
    setSelectedCustomer(activeTabSummary.customer);
    setDomicilioAddress(activeTabSummary.customer?.address ?? "");
  }, [activeTabSummary, activeTabId]);
  // Al cambiar de cuenta (o salir de una, p. ej. si no se pudo cargar), el
  // cliente anterior se quita de inmediato: mientras llega el detalle de la
  // nueva no debe poder cobrarse a nombre de quien estaba antes.
  useEffect(() => {
    if (activeTabId === shownTabId.current) return;
    setSelectedCustomer(null);
    setDomicilioAddress("");
    if (!activeTabId) shownTabId.current = null;
  }, [activeTabId]);

  // Productos de la cuenta que contienen algo a lo que es alérgica una
  // mascota del cliente (CRM-02). Solo avisa: puede ser para otra mascota.
  const allergyConflicts = selectedCustomer
    ? findAllergyConflicts(selectedCustomer.pets, [
        ...(activeTabSummary?.items ?? []).map((item) => ({
          key: item.id,
          productName: item.productName,
          allergenTags: item.allergenTags,
        })),
        ...lines.map((line) => ({
          key: line.lineId,
          productName: line.productName,
          allergenTags: allergensByVariant[line.productVariantId] ?? [],
        })),
      ])
    : [];
  const conflictsByKey = new Map<string, string[]>();
  for (const c of allergyConflicts) {
    conflictsByKey.set(c.key, [...(conflictsByKey.get(c.key) ?? []), `${c.petName}: ${c.allergens.join(", ")}`]);
  }

  // Confirmación de la última acción — venta cobrada o cuenta dejada
  // abierta — como popup modal (antes la venta se quedaba como un aviso
  // fijo en la lista que había que cerrar a mano, y dejar una cuenta
  // abierta no avisaba nada, QA de octubre 2026).
  const [lastReceipt, setLastReceipt] = useState<SaleReceipt | null>(null);
  const [tabConfirmation, setTabConfirmation] = useState<TabConfirmation | null>(null);

  function resetOrderState() {
    setSelectedCustomer(null);
    setDomicilioAddress("");
    setDomicilioOrigen("TELEFONO");
    setOrderType("PARA_LLEVAR");
    setTableNumber("");
    setActiveTabId(null);
  }

  // Soltar la cuenta retomada (sigue en espera, sin cambios) y volver a
  // una venta nueva. La ronda sin agregar se descarta (se confirma antes).
  const [confirmExitTab, setConfirmExitTab] = useState(false);
  const [tabToCancel, setTabToCancel] = useState<ShiftSaleRow | null>(null);
  function exitTab(message = "Saliste de la cuenta — sigue en espera.") {
    useCartStore.getState().clear();
    setTabError(null);
    setRegisteredError(null);
    resetOrderState();
    onTabChanged();
    if (message) notify(message);
  }

  function handleConfirmed(receipt: SaleReceipt) {
    setTabConfirmation(null);
    setLastReceipt(receipt);
    setView("cart");
    resetOrderState();
    // Si se cobró una cuenta de Mesa, ya no está abierta — refresca el
    // contador de "Cuentas en espera".
    onTabChanged();
  }

  // Advertencia de insumos insuficientes al dejar/agregar a una cuenta
  // abierta: el servidor la rechaza con un mensaje que empieza con
  // SHORTAGE_ERROR_PREFIX y aquí se ofrece reintentar confirmando.
  const [shortageMessage, setShortageMessage] = useState<string | null>(null);

  function handleLeaveOpen(allowShortage = false) {
    setTabError(null);
    setShortageMessage(null);
    if (lines.length === 0) return;
    if (!activeTabId && !tableNumber.trim()) {
      setTabError(
        orderType === "CONSUMO_LOCAL" ? "Captura el número de mesa." : "Captura un nombre o nota para identificar el pedido."
      );
      return;
    }

    if (!tabRequestIdRef.current) tabRequestIdRef.current = randomId();
    const clientRequestId = tabRequestIdRef.current;
    tabRetryAllowShortageRef.current = allowShortage;

    startSavingTab(async () => {
      try {
        const items = lines.map(cartLineToSaleItemInput);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
        const isNewTab = !activeTabId;
        const total = (activeTabSummary?.total ?? 0) + subtotal();
        const resolvedTableNumber = tableNumber;
        if (activeTabId) {
          await addItemsToTab({ saleId: activeTabId, branchId, shiftId, employeeId, items, allowShortage, clientRequestId });
        } else {
          await openTab({
            branchId,
            shiftId,
            employeeId,
            tableNumber,
            orderType,
            domicilioOrigen: orderType === "DOMICILIO" ? domicilioOrigen : undefined,
            customerId: selectedCustomer?.id,
            items,
            allowShortage,
            clientRequestId,
          });
        }
        tabRequestIdRef.current = null;
        setTabOfflineRetry(false);
        useCartStore.getState().clear();
        setLastReceipt(null);
        setTabConfirmation({ tableNumber: resolvedTableNumber, orderType, itemCount, total, isNewTab });
        resetOrderState();
        onTabChanged();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo dejar la cuenta abierta.";
        if (isShortageError(message)) {
          setShortageMessage(message);
        } else {
          setTabError(message);
        }
        // Solo una falla de red reintenta sola — un error de negocio real
        // (mesa duplicada, stock, etc.) se queda mostrado para que el
        // cajero lo resuelva a mano.
        setTabOfflineRetry(err instanceof NetworkError);
      }
    });
  }

  // Mismo patrón que el reintento de cobro en checkout-form.tsx.
  useEffect(() => {
    if (!tabOfflineRetry) return;
    const retry = () => handleLeaveOpen(tabRetryAllowShortageRef.current);
    const interval = setInterval(retry, 5000);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabOfflineRetry]);

  // Si el servidor exige autorización, abre el diálogo de PIN en vez de
  // mostrar el error; con PIN, un error (PIN incorrecto) se queda en el
  // diálogo. Regresa true si la corrección se aplicó.
  function handleCorrectionError(err: unknown, item: OpenTabItem, newQuantity: number | null, authorizingPin?: string) {
    const message = err instanceof Error ? err.message : "No se pudo corregir el producto.";
    if (authorizingPin !== undefined) {
      setAuthError(message);
    } else if (isAuthorizationRequiredError(message)) {
      setAuthPin("");
      setAuthError(null);
      setAuthRequest({ item, newQuantity, message });
    } else {
      setRegisteredError(message);
    }
  }

  async function handleRemoveRegistered(item: OpenTabItem, authorizingPin?: string): Promise<boolean> {
    setRegisteredError(null);
    setPendingItemId(item.id);
    try {
      const { removedItem } = await removeTabItem({ saleItemId: item.id, branchId, shiftId, employeeId, authorizingPin });
      onTabChanged();
      if (removedItem && activeTabId) {
        notify(`"${item.productName}" quitado.`, "info", {
          label: "Deshacer",
          onClick: async () => {
            try {
              await addItemsToTab({
                saleId: activeTabId,
                branchId,
                shiftId,
                employeeId,
                items: [removedItem],
              });
              onTabChanged();
            } catch (err) {
              setRegisteredError(err instanceof Error ? err.message : "No se pudo deshacer.");
            }
          },
        });
      }
      return true;
    } catch (err) {
      handleCorrectionError(err, item, null, authorizingPin);
      return false;
    } finally {
      setPendingItemId(null);
    }
  }

  async function handleAdjustRegistered(saleItemId: string, newQuantity: number, item: OpenTabItem, authorizingPin?: string): Promise<boolean> {
    setRegisteredError(null);
    if (newQuantity <= 0) return handleRemoveRegistered(item, authorizingPin);
    setPendingItemId(saleItemId);
    try {
      await updateTabItemQuantity({ saleItemId, branchId, shiftId, employeeId, quantity: newQuantity, authorizingPin });
      onTabChanged();
      return true;
    } catch (err) {
      handleCorrectionError(err, item, newQuantity, authorizingPin);
      return false;
    } finally {
      setPendingItemId(null);
    }
  }

  function handleAuthorize() {
    if (!authRequest) return;
    const { item, newQuantity } = authRequest;
    setAuthError(null);
    startAuthorizing(async () => {
      const ok =
        newQuantity === null
          ? await handleRemoveRegistered(item, authPin)
          : await handleAdjustRegistered(item.id, newQuantity, item, authPin);
      if (ok) {
        setAuthRequest(null);
        setAuthPin("");
      }
    });
  }

  // El cobro y la cuenta se montan juntos y solo se oculta el que no está
  // en uso: así "← Atrás" no borra lo capturado en el cobro (recibido,
  // propina, descuento — QA-028).
  return (
    <div className="h-full min-h-0">
      <div
        className={cn(
          "h-full flex-col overflow-y-auto border-t border-border md:border-l md:border-t-0",
          view === "checkout" ? "flex" : "hidden"
        )}
      >
        <CheckoutForm
            branchId={branchId}
            shiftId={shiftId}
            employeeId={employeeId}
            activeTabSummary={activeTabSummary}
            selectedCustomer={selectedCustomer}
            domicilioAddress={domicilioAddress}
            domicilioOrigen={domicilioOrigen}
            onConfirmed={handleConfirmed}
            onCancel={() => setView("cart")}
          />
      </div>
    <div
      className={cn(
        "h-full min-h-0 flex-col border-t border-border md:border-l md:border-t-0",
        view === "cart" ? "flex" : "hidden"
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <p className="font-semibold">Cuenta actual</p>
        <div className="flex gap-1.5">
          {orderTypes.map((type) => (
            <button
              aria-pressed={orderType === type.value}
              key={type.value}
              type="button"
              onClick={() => setOrderType(type.value)}
              className={cn(
                "min-h-10 flex-1 rounded-full border border-border px-2 py-2 text-xs font-medium",
                orderType === type.value ? posAccentClass : "hover:bg-muted"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="table-number">
            {orderType === "CONSUMO_LOCAL" ? "Número de mesa" : "Nombre o nota (para dejar en espera)"}
          </Label>
          <Input
            id="table-number"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder={orderType === "CONSUMO_LOCAL" ? "Número de mesa" : "ej. Juan, chamarra roja"}
            className="h-9"
            disabled={Boolean(activeTabId)}
          />
        </div>
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
          allergenSuggestions={allergenSuggestions}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {allergyConflicts.length > 0 && (
          <Alert variant="warning" className="mb-3">
            <p className="font-semibold">⚠ Alergias de las mascotas de {selectedCustomer?.name}</p>
            <ul className="mt-1 list-disc pl-5">
              {allergyConflicts.map((c) => (
                <li key={`${c.key}-${c.petName}`}>
                  {c.productName} contiene {c.allergens.join(", ")} (alergia de {c.petName})
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {activeTabSummary && (
          <div className="mb-4 flex flex-col gap-2">
            {/* Salir deja la cuenta en espera tal cual y vuelve a una venta
                nueva; Cancelar la anula (motivo + PIN, igual que en Caja). */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-2">
              <p className="text-sm font-semibold">
                {activeTabSummary.tableNumber
                  ? orderType === "CONSUMO_LOCAL"
                    ? `Mesa ${activeTabSummary.tableNumber}`
                    : activeTabSummary.tableNumber
                  : "Cuenta en espera"}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (lines.length > 0 ? setConfirmExitTab(true) : exitTab())}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Salir
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() =>
                    setTabToCancel({
                      id: activeTabSummary.id,
                      status: "ABIERTA",
                      createdAt: "",
                      orderType,
                      tableNumber: activeTabSummary.tableNumber,
                      total: activeTabSummary.total,
                      tipAmount: 0,
                      employeeName: "",
                      paymentMethods: [],
                    })
                  }
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Cancelar cuenta
                </Button>
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ya registrado en la cuenta — revisa con el cliente antes de cobrar
            </p>
            {registeredError && <p role="alert" className="text-xs text-destructive">{registeredError}</p>}
            {activeTabSummary.items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Todavía no hay nada registrado (se quitó todo) — la cuenta sigue abierta.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {activeTabSummary.items.map((item) => {
                const isPending = pendingItemId === item.id;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "rounded-xl border p-3",
                      conflictsByKey.has(item.id) ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/30" : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {item.productName} · {item.productVariantName}
                          {item.temperature && ` · ${temperatureLabels[item.temperature]}`}
                        </p>
                        {item.modifierNames.length > 0 && (
                          <p className="text-xs text-muted-foreground">{item.modifierNames.join(", ")}</p>
                        )}
                        {item.notes && (
                          <p className="line-clamp-2 break-words text-xs italic text-muted-foreground" title={item.notes}>
                            “{item.notes}”
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveRegistered(item)}
                        disabled={isPending}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-50"
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
                          className="h-11 w-11 rounded-full"
                          disabled={isPending}
                          onClick={() => handleAdjustRegistered(item.id, item.quantity - 1, item)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-11 w-11 rounded-full"
                          disabled={isPending}
                          onClick={() => handleAdjustRegistered(item.id, item.quantity + 1, item)}
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
            <div className="flex items-center justify-between gap-2">
              {/* Pre-cuenta para mostrarle al cliente antes de cobrar — solo
                  lo ya registrado; la ronda actual hay que agregarla antes. */}
              <a
                href={`/pos/cuenta/${activeTabSummary.id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={lines.length > 0}
                onClick={(e) => {
                  if (lines.length > 0) e.preventDefault();
                }}
                title={lines.length > 0 ? "Agrega la ronda actual a la cuenta antes de imprimirla" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium",
                  lines.length > 0 ? "cursor-not-allowed opacity-50" : "hover:bg-muted"
                )}
              >
                Imprimir cuenta
              </a>
              <p className="text-right text-xs text-muted-foreground">
                Ya registrado: {formatCurrency(activeTabSummary.total)}
              </p>
            </div>
            {lines.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Para imprimir la cuenta, primero agrega la ronda actual (&ldquo;Agregar a la cuenta&rdquo;).
              </p>
            )}
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
            <li
              key={line.lineId}
              className={cn(
                "flex gap-3 rounded-xl border p-3",
                conflictsByKey.has(line.lineId) ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/30" : "border-border"
              )}
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={line.imageUrl} alt={line.productName} className="h-full w-full object-cover" />
                ) : (
                  <Coffee className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {line.productName} · {line.variantName}
                    </p>
                    {conflictsByKey.has(line.lineId) && (
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                        ⚠ Alergia — {conflictsByKey.get(line.lineId)!.join(" / ")}
                      </p>
                    )}
                    {(line.modifiers.length > 0 || line.extraIngredients.length > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          ...line.modifiers.map((m) => m.name),
                          ...line.extraIngredients.map((e) => `+ ${e.name} (${e.quantity} ${unitLabel(e.unit)})`),
                        ].join(", ")}
                      </p>
                    )}
                    {line.notes && (
                      <p className="line-clamp-2 break-words text-xs italic text-muted-foreground" title={line.notes}>
                        “{line.notes}”
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      removeLine(line.lineId);
                      notify(`"${line.productName}" quitado.`, "info", {
                        label: "Deshacer",
                        onClick: () => restoreLine(line),
                      });
                    }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
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
                      className="h-11 w-11 rounded-full"
                      onClick={() => decrementLine(line.lineId)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-11 w-11 rounded-full"
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
        {tabError && <p role="alert" className="mb-2 text-xs text-destructive">{tabError}</p>}
        {tabOfflineRetry && (
          <p role="status" className="mb-2 text-xs text-amber-600">
            Se enviará sola en cuanto vuelva la conexión — no hace falta volver a intentar.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={lines.length === 0 || isSavingTab}
            onClick={() => handleLeaveOpen()}
          >
            {isSavingTab ? "Guardando..." : activeTabId ? "Agregar a la cuenta" : "Dejar en espera"}
          </Button>
          <Button
            className={cn("flex-1", posAccentClass)}
            disabled={lines.length === 0 && !activeTabId}
            onClick={() => {
              setLastReceipt(null);
              setTabConfirmation(null);
              setView("checkout");
            }}
          >
            Cobrar
          </Button>
        </div>
      </div>
      <ReceiptDialog
        employeeId={employeeId}
        saleReceipt={lastReceipt}
        tabConfirmation={tabConfirmation}
        onClose={() => {
          setLastReceipt(null);
          setTabConfirmation(null);
        }}
      />
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
      <ConfirmDialog
        open={confirmExitTab}
        title="¿Salir de la cuenta?"
        message="La cuenta sigue en espera con lo ya registrado, pero los productos de la ronda actual (sin agregar) se van a descartar."
        confirmLabel="Salir y descartar la ronda"
        destructive
        onConfirm={() => {
          setConfirmExitTab(false);
          exitTab();
        }}
        onCancel={() => setConfirmExitTab(false)}
      />
      <Dialog
        open={authRequest !== null}
        onOpenChange={(open) => {
          if (!open) setAuthRequest(null);
        }}
        title="Autorizar corrección"
      >
        {authRequest && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleAuthorize();
            }}
          >
            <p className="text-sm text-muted-foreground">
              {authRequest.newQuantity === null
                ? `Quitar "${authRequest.item.productName}" de la cuenta.`
                : `Bajar "${authRequest.item.productName}" de ${authRequest.item.quantity} a ${authRequest.newQuantity}.`}{" "}
              {authRequest.message.replace(/^[^:]*:\s*/, "")} Queda registrado en el detalle de la venta.
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="tab-correction-pin">PIN de quien autoriza</Label>
              <Input
                id="tab-correction-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={authPin}
                onChange={(e) => setAuthPin(e.target.value)}
                placeholder="PIN de un empleado con permiso"
              />
            </div>
            {authError && <p role="alert" className="text-sm text-destructive">{authError}</p>}
            <Button type="submit" variant="destructive" disabled={isAuthorizing || !authPin}>
              {isAuthorizing ? "Autorizando..." : "Autorizar"}
            </Button>
          </form>
        )}
      </Dialog>
      <CancelSaleDialog
        sale={tabToCancel}
        onOpenChange={(open) => {
          if (!open) setTabToCancel(null);
        }}
        branchId={branchId}
        shiftId={shiftId}
        employeeId={employeeId}
        onCancelled={() => exitTab("")}
      />
    </div>
    </div>
  );
}
