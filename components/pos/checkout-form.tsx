"use client";

import { useBusinessSettings } from "@/components/layout/business-settings-context";
import { includedTax, PAYMENT_METHOD_LABELS } from "@/lib/settings-shared";
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
import { withActionErrors, NetworkError } from "@/lib/action-result";
import { randomId } from "@/lib/id";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createSale = withActionErrors(createSaleAction);
const closeTab = withActionErrors(closeTabAction);
const previewSaleTotal = withActionErrors(previewSaleTotalAction);
const findDiscountCodeByCode = withActionErrors(findDiscountCodeByCodeAction);
const updateCustomer = withActionErrors(updateCustomerAction);


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
  // Uno o varios métodos (pago dividido, D8) — amount de cada uno.
  payments: { method: PaymentMethod; amount: number; tipAmount?: number }[];
  // Efectivo recibido y cambio total — null si no hubo efectivo con monto
  // recibido capturado (en pago dividido, suma de los renglones en efectivo).
  cashReceived: number | null;
  change: number | null;
  // IVA contenido (Configuración → Impuestos); 0 si no se desglosa.
  taxIncluded: number;
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
  // Configuración → Cobro / Descuentos / Impuestos.
  const settings = useBusinessSettings();
  const paymentMethods = settings.paymentMethods.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));
  const [method, setMethod] = useState<PaymentMethod>(settings.paymentMethods[0] ?? "EFECTIVO");
  const [transferNote, setTransferNote] = useState("");
  // Pago dividido (D8, "split-payment flow") — por default la cuenta se
  // cobra completa con un solo método, como siempre; "Dividir el pago"
  // cambia a una lista de pagos — pensado tanto para quien usa dos métodos
  // como para una mesa donde cada quien paga su parte: `amount` es la
  // parte de la cuenta (sin propina) y cada renglón deja su propia
  // propina. Las partes deben sumar exacto el total. Cada renglón en
  // efectivo puede capturar lo recibido para calcular su propio cambio
  // (vacío = se recibió exacto).
  type SplitRow = {
    id: string;
    method: PaymentMethod;
    amount: string;
    tipMode: "NINGUNA" | "PORCENTAJE" | "MONTO";
    tipPercent: number;
    tipCustom: string;
    received: string;
  };
  const [splitRows, setSplitRows] = useState<SplitRow[] | null>(null);
  const isSplit = splitRows !== null;

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
  // Configuración → Inventario: si este empleado puede vender con faltantes.
  const [canOverrideShortage, setCanOverrideShortage] = useState(true);
  // Id del intento de cobro: se reutiliza en reintentos (p. ej. tras un
  // corte de red) para que el servidor nunca registre la venta dos veces;
  // se renueva si cambia la cuenta o después de cobrar.
  const requestIdRef = useRef<string | null>(null);
  // Si se cayó la red a medio cobro, se reintenta solo (mismo
  // clientRequestId, nunca duplica) hasta que entre o se edite el
  // carrito — ver el useEffect de offlineRetry más abajo.
  const [offlineRetry, setOfflineRetry] = useState(false);
  useEffect(() => {
    requestIdRef.current = null;
    setOfflineRetry(false);
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
      .then(
        ({
          subtotal: serverSubtotal,
          discountableSubtotal,
          appliedPromotions: promos,
          shortages: missing,
          canOverrideShortage: canOverride,
        }) => {
          if (!cancelled) {
            setVerifiedSubtotal(serverSubtotal);
            setVerifiedDiscountableSubtotal(discountableSubtotal);
            setAppliedPromotions(promos);
            setShortages(missing);
            setCanOverrideShortage(canOverride);
          }
        }
      )
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
  const [tipPercent, setTipPercent] = useState(settings.tipPercents[0] ?? 10);
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
  const totalCents = Math.round(total * 100);

  // Pago dividido: cada renglón es "la parte" de una persona (sin propina)
  // más su propia propina — las partes suman el total de la cuenta y las
  // propinas se suman encima.
  function splitRowBaseCents(row: SplitRow) {
    return Math.round((Number(row.amount) || 0) * 100);
  }
  function splitRowTipCents(row: SplitRow) {
    if (row.tipMode === "PORCENTAJE") return Math.round((splitRowBaseCents(row) * row.tipPercent) / 100);
    if (row.tipMode === "MONTO") return Math.max(0, Math.round((Number(row.tipCustom) || 0) * 100));
    return 0;
  }
  function splitRowTotalCents(row: SplitRow) {
    return splitRowBaseCents(row) + splitRowTipCents(row);
  }
  const splitTipCents = (splitRows ?? []).reduce((sum, row) => sum + splitRowTipCents(row), 0);

  const tipValue = isSplit
    ? splitTipCents / 100
    : tipMode === "PORCENTAJE"
      ? Math.round(total * tipPercent) / 100
      : tipMode === "MONTO"
        ? Math.max(0, Math.round((Number(tipCustom) || 0) * 100) / 100)
        : 0;
  const totalToCollect = Math.round((total + tipValue) * 100) / 100;
  // Propina mayor al umbral (por defecto, la mitad de la cuenta): casi
  // siempre es un error de captura (ej. 100000 en vez de 100) — se pide
  // confirmarla (QA-028). Umbral en Configuración → Cobro. En pago
  // dividido se revisa contra la parte de cada persona.
  const isHighTip = isSplit
    ? (splitRows ?? []).some(
        (row) => splitRowTipCents(row) > (splitRowBaseCents(row) * settings.highTipThresholdPercent) / 100
      )
    : total > 0 && tipValue > (total * settings.highTipThresholdPercent) / 100;
  const taxIncluded = includedTax(total, settings);
  const cashReceivedCents = Math.round((Number(cashReceived) || 0) * 100);
  const totalToCollectCents = Math.round(totalToCollect * 100);
  const splitAssignedCents = (splitRows ?? []).reduce((sum, row) => sum + splitRowBaseCents(row), 0);
  const splitRemainingCents = totalCents - splitAssignedCents;
  // Cambio de un renglón en efectivo (sobre su parte + su propina): null si
  // no aplica (otro método o no se capturó lo recibido), negativo si lo
  // recibido no alcanza.
  function splitRowChangeCents(row: SplitRow): number | null {
    if (row.method !== "EFECTIVO" || row.received.trim() === "") return null;
    return Math.round((Number(row.received) || 0) * 100) - splitRowTotalCents(row);
  }
  const splitChangeCents = (splitRows ?? []).reduce((sum, row) => sum + Math.max(0, splitRowChangeCents(row) ?? 0), 0);
  const splitHasInsufficientCash = (splitRows ?? []).some((row) => (splitRowChangeCents(row) ?? 0) < 0);
  const splitCashRows = (splitRows ?? []).filter((row) => row.method === "EFECTIVO" && row.received.trim() !== "");

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
              : settings.maxManualDiscountPercent !== null &&
                  discountPreview > (discountableBase * settings.maxManualDiscountPercent) / 100 + 0.005
                ? `El descuento manual no puede pasar del ${settings.maxManualDiscountPercent}% del subtotal.`
                : null;

  function resetDiscountState() {
    setCodeInput("");
    setResolvedCode(null);
    setCodeError(null);
    setManualValue("0");
    setAuthorizingPin("");
  }

  function newSplitRow(amount: string, rowMethod: PaymentMethod = paymentMethods[0]?.value ?? "EFECTIVO"): SplitRow {
    return {
      id: randomId(),
      method: rowMethod,
      amount,
      tipMode: "NINGUNA",
      tipPercent: settings.tipPercents[0] ?? 10,
      tipCustom: "",
      received: "",
    };
  }
  function startSplitPayment() {
    // La propina pasa a capturarse por persona.
    setTipMode("NINGUNA");
    setTipCustom("");
    setSplitRows([newSplitRow(total > 0 ? total.toFixed(2) : "", method)]);
  }
  function cancelSplitPayment() {
    setSplitRows(null);
  }
  function addSplitRow() {
    // El nuevo renglón se prellena con lo que falta por asignar.
    const remaining = splitRemainingCents > 0 ? (splitRemainingCents / 100).toFixed(2) : "";
    setSplitRows((prev) => [...(prev ?? []), newSplitRow(remaining)]);
  }
  // "Partes iguales": reparte el total entre N personas; los centavos que
  // no se dividen exacto van a las primeras partes (nunca se pierden).
  const [equalParts, setEqualParts] = useState("2");
  function splitEqually() {
    const n = Math.max(1, Math.min(50, Math.floor(Number(equalParts) || 0)));
    const base = Math.floor(totalCents / n);
    const extra = totalCents - base * n;
    setSplitRows((prev) =>
      Array.from({ length: n }, (_, i) => {
        // Conserva método/propina de los renglones que ya existían.
        const existing = prev?.[i];
        const amount = ((base + (i < extra ? 1 : 0)) / 100).toFixed(2);
        return existing ? { ...existing, amount } : newSplitRow(amount);
      })
    );
  }
  function updateSplitRow(id: string, patch: Partial<SplitRow>) {
    setSplitRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeSplitRow(id: string) {
    setSplitRows((prev) => (prev ?? []).filter((r) => r.id !== id));
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

    if (!requestIdRef.current) requestIdRef.current = randomId();
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

        const payments = isSplit
          ? splitRows!.map((row) => ({
              method: row.method,
              amount: splitRowTotalCents(row) / 100,
              tipAmount: splitRowTipCents(row) / 100,
            }))
          : [
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
          payments,
          cashReceived: isSplit
            ? splitCashRows.length > 0
              ? splitCashRows.reduce((sum, row) => sum + (Number(row.received) || 0), 0)
              : null
            : method === "EFECTIVO"
              ? cashReceivedCents / 100
              : null,
          change: isSplit
            ? splitCashRows.length > 0
              ? splitChangeCents / 100
              : null
            : method === "EFECTIVO"
              ? (cashReceivedCents - totalToCollectCents) / 100
              : null,
          taxIncluded,
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
        setSplitRows(null);
        onConfirmed(receipt);
        setOfflineRetry(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
        // Solo una falla de red reintenta sola — un error de negocio real
        // (stock, PIN, etc.) se queda mostrado para que el cajero lo
        // resuelva a mano.
        setOfflineRetry(err instanceof NetworkError);
      }
    });
  }

  // Reintenta el mismo cobro (mismo clientRequestId, nunca duplica) cada
  // vez que el navegador avisa que volvió la red, y además cada 5s por si
  // el aviso del navegador no llega (ej. el servidor se reinició pero el
  // WiFi nunca se desconectó).
  useEffect(() => {
    if (!offlineRetry) return;
    const interval = setInterval(handleConfirm, 5000);
    window.addEventListener("online", handleConfirm);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleConfirm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineRetry]);

  // Misma condición que deshabilita el botón — se reutiliza para Enter
  // (ver handleKeyDown) en vez de duplicarla y arriesgar que se desfasen.
  const confirmDisabled =
    isPending ||
    isPreviewLoading ||
    (shortages.length > 0 && !allowShortage) ||
    (isHighTip && !confirmHighTip) ||
    (tipMode === "MONTO" && Number(tipCustom) < 0) ||
    verifiedSubtotal === null ||
    (lines.length === 0 && !activeTabId) ||
    (discountMode === "CODIGO" && !resolvedCode) ||
    (discountMode === "MANUAL" && (!authorizingPin || manualDiscountError !== null)) ||
    (isSplit
      ? splitRows!.length === 0 ||
        splitRows!.some((r) => !(Number(r.amount) > 0)) ||
        splitRemainingCents !== 0 ||
        splitHasInsufficientCash
      : method === "EFECTIVO" && (cashReceived === "" || cashReceivedCents < totalToCollectCents));

  // Enter confirma el cobro en cuanto el formulario ya es válido — salvo
  // dentro de un <textarea> (ahí Enter es un salto de línea) o mientras se
  // escribe el código de descuento (ahí Enter valida el código, ver su
  // propio onKeyDown más abajo).
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    if (confirmDisabled) return;
    e.preventDefault();
    handleConfirm();
  }

  return (
    <div className="flex flex-col gap-4 p-4" onKeyDown={handleKeyDown}>
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
          Cerrando {orderType === "CONSUMO_LOCAL" ? `cuenta de Mesa ${tableNumber || "—"}` : `pedido en espera${tableNumber ? ` (${tableNumber})` : ""}`} · ya registrado: {formatCurrency(activeTabBaseTotal ?? 0)}
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
                onKeyDown={(e) => {
                  // Enter aquí valida el código, no intenta cobrar — por
                  // eso se detiene antes de llegar al onKeyDown del panel.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isCheckingCode && codeInput) handleCheckCode();
                  }
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
        {taxIncluded > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Incluye IVA ({settings.taxRatePercent}%)</span>
            <span>{formatCurrency(taxIncluded)}</span>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Propina</p>
        {isSplit ? (
          <p className="text-xs text-muted-foreground">En pago dividido cada persona deja su propina en su renglón (abajo).</p>
        ) : (
        <>
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
          {settings.tipPercents.map((pct) => (
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
        </>
        )}
        {isHighTip && (
          <label className="mt-2 flex items-center gap-2 text-sm text-destructive">
            <input type="checkbox" checked={confirmHighTip} onChange={(e) => setConfirmHighTip(e.target.checked)} />
            {isSplit
              ? `Confirmo propinas de más del ${settings.highTipThresholdPercent}% de la parte de alguien`
              : `Confirmo una propina de ${formatCurrency(tipValue)} (más del ${settings.highTipThresholdPercent}% de la cuenta)`}
          </label>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Método de pago</p>
          {paymentMethods.length > 1 &&
            (isSplit ? (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={cancelSplitPayment}>
                Un solo método
              </button>
            ) : (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={startSplitPayment}>
                Dividir el pago
              </button>
            ))}
        </div>

        {!isSplit ? (
          <>
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
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Partes iguales entre</span>
              <Input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                className="h-9 w-16"
                aria-label="Número de personas"
                value={equalParts}
                onChange={(e) => setEqualParts(e.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={splitEqually}>
                Dividir
              </Button>
            </div>
            {splitRows!.map((row, index) => {
              const changeCents = splitRowChangeCents(row);
              const tipCents = splitRowTipCents(row);
              return (
                <div key={row.id} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label="Método de este pago"
                      className="flex-1"
                      value={row.method}
                      onChange={(e) => updateSplitRow(row.id, { method: e.target.value as PaymentMethod })}
                    >
                      {paymentMethods.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className="w-28"
                      aria-label={`Monto de este pago (${PAYMENT_METHOD_LABELS[row.method]})`}
                      placeholder="Su parte"
                      value={row.amount}
                      onChange={(e) => updateSplitRow(row.id, { amount: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={splitRows!.length === 1}
                      onClick={() => removeSplitRow(row.id)}
                    >
                      Quitar
                    </Button>
                  </div>
                  <div className="flex gap-1" role="group" aria-label={`Propina del pago ${index + 1}`}>
                    {(
                      [
                        { key: "NINGUNA", label: "Sin propina", active: row.tipMode === "NINGUNA", patch: { tipMode: "NINGUNA" } },
                        ...settings.tipPercents.map((pct) => ({
                          key: `p${pct}`,
                          label: `${pct}%`,
                          active: row.tipMode === "PORCENTAJE" && row.tipPercent === pct,
                          patch: { tipMode: "PORCENTAJE", tipPercent: pct },
                        })),
                        { key: "MONTO", label: "Monto", active: row.tipMode === "MONTO", patch: { tipMode: "MONTO" } },
                      ] as { key: string; label: string; active: boolean; patch: Partial<SplitRow> }[]
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        aria-pressed={opt.active}
                        onClick={() => {
                          updateSplitRow(row.id, opt.patch);
                          setConfirmHighTip(false);
                        }}
                        className={cn(
                          "min-h-10 flex-1 rounded-md border border-border px-1 text-xs",
                          opt.active ? posAccentBorderClass : "hover:bg-muted"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {row.tipMode === "MONTO" && (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Monto de propina del pago ${index + 1}`}
                      placeholder="Monto de la propina"
                      value={row.tipCustom}
                      onChange={(e) => {
                        updateSplitRow(row.id, { tipCustom: e.target.value });
                        setConfirmHighTip(false);
                      }}
                    />
                  )}
                  <p className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {tipCents > 0 ? `Parte + propina ${formatCurrency(tipCents / 100)}` : "Paga"}
                    </span>
                    <span className="font-semibold">{formatCurrency(splitRowTotalCents(row) / 100)}</span>
                  </p>
                  {row.method === "EFECTIVO" && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="flex-1"
                        aria-label="Efectivo recibido en este pago"
                        placeholder="Recibido (vacío = exacto)"
                        value={row.received}
                        onChange={(e) => updateSplitRow(row.id, { received: e.target.value })}
                      />
                      <span
                        className={cn(
                          "w-32 text-right text-sm",
                          changeCents !== null && changeCents < 0 ? "text-destructive" : "font-semibold"
                        )}
                      >
                        {changeCents === null
                          ? "Cambio: —"
                          : changeCents < 0
                            ? "No alcanza"
                            : `Cambio: ${formatCurrency(changeCents / 100)}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addSplitRow}>
              + Agregar persona o método
            </Button>
            <div
              className={cn(
                "flex items-center justify-between text-sm font-medium",
                splitRemainingCents === 0 ? "text-emerald-700" : "text-destructive"
              )}
            >
              <span>
                {splitRemainingCents === 0
                  ? "Suma exacta"
                  : splitRemainingCents > 0
                    ? "Falta por asignar"
                    : "Sobra asignado"}
              </span>
              <span>{formatCurrency(Math.abs(splitRemainingCents) / 100)}</span>
            </div>
            {splitCashRows.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Cambio total a entregar</span>
                <span className="text-lg font-semibold">{formatCurrency(splitChangeCents / 100)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isSplit && method === "EFECTIVO" && (
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
            {settings.cashQuickBills.map((bill) => (
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
      {offlineRetry && (
        <p role="status" className="text-sm text-amber-600">
          La venta se enviará sola en cuanto vuelva la conexión — no se va a duplicar, no hace falta volver a cobrar.
        </p>
      )}

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
          {canOverrideShortage ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowShortage}
                onChange={(e) => setAllowShortage(e.target.checked)}
              />
              Vender de todos modos (el inventario quedará en negativo)
            </label>
          ) : (
            <p className="text-destructive">
              {settings.shortagePolicy === "BLOQUEAR"
                ? "No se permite vender sin insumos suficientes. Quita esos productos o registra la entrada de inventario."
                : "Solo un gerente o administrador puede confirmar esta venta."}
            </p>
          )}
        </div>
      )}

      {/* Fijo al fondo del panel con scroll: en celular el formulario es
          más alto que la pantalla y "Confirmar" quedaba fuera de vista. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-border bg-background p-4">
        <Button
          className={cn("w-full", posAccentClass)}
          onClick={handleConfirm}
          disabled={confirmDisabled}
        >
          {isPending ? "Procesando..." : isPreviewLoading ? "Calculando total..." : "Confirmar venta"}
        </Button>
      </div>
    </div>
  );
}
