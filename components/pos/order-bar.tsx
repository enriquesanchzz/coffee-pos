"use client";

import type { SaleOrderType } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { CustomerOption } from "@/lib/customers";
import { cn } from "@/lib/utils";
import { useCartStore } from "./cart-store";
import { CustomerPicker } from "./customer-picker";
import { useOrderCustomerStore } from "./order-customer-store";

// "Mesa" = CONSUMO_LOCAL (el valor del enum no cambió, solo la etiqueta).
const orderTypes: { value: SaleOrderType; label: string }[] = [
  { value: "CONSUMO_LOCAL", label: "Mesa" },
  { value: "PARA_LLEVAR", label: "Para llevar" },
  { value: "DOMICILIO", label: "A domicilio" },
];

// Datos de la orden: tipo, mesa / a nombre de quién y cliente. En tablet y
// escritorio va arriba del catálogo (variant "bar") para que la columna de
// la cuenta quede para los productos; en celular, dentro de la hoja de la
// cuenta (variant "panel"). Se monta UNA sola copia a la vez (ver
// useIsTabletUp): los campos tienen id fijo (#table-number, #customer).
export function OrderBar({
  variant,
  customers,
  employeeId,
  allergenSuggestions,
  actions,
}: {
  variant: "bar" | "panel";
  // Botones de caja (Cuentas en espera, Retiro/ingreso, Apertura): en la
  // barra van a la derecha de la primera fila.
  actions?: React.ReactNode;
  customers: CustomerOption[];
  employeeId: string;
  allergenSuggestions: string[];
}) {
  const orderType = useCartStore((s) => s.orderType);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const tableNumber = useCartStore((s) => s.tableNumber);
  const setTableNumber = useCartStore((s) => s.setTableNumber);
  const activeTabId = useCartStore((s) => s.activeTabId);
  const {
    selectedCustomer,
    setSelectedCustomer,
    domicilioAddress,
    setDomicilioAddress,
    domicilioOrigen,
    setDomicilioOrigen,
  } = useOrderCustomerStore();
  const isBar = variant === "bar";
  const tableLabel = orderType === "CONSUMO_LOCAL" ? "Número de mesa" : "¿A nombre de quién?";

  const orderTypeControl = (
    <SegmentedControl
      label="Tipo de orden"
      options={orderTypes}
      value={orderType}
      onChange={setOrderType}
      // En la barra, cada opción a su ancho y en una línea ("Para llevar"
      // no se parte).
      className={cn("flex-nowrap", isBar && "[&>button]:flex-none [&>button]:whitespace-nowrap")}
    />
  );
  const tableField = (
    <div className={cn("flex flex-col gap-1", isBar && "w-52 shrink-0")}>
      <Label htmlFor="table-number" className={cn(isBar && "sr-only")}>
        {tableLabel}
      </Label>
      <Input
        id="table-number"
        value={tableNumber}
        onChange={(e) => setTableNumber(e.target.value)}
        placeholder={orderType === "CONSUMO_LOCAL" ? "Número de mesa" : "¿A nombre de quién?"}
        className={isBar ? "h-11" : "h-9"}
        disabled={Boolean(activeTabId)}
      />
    </div>
  );
  const customerPicker = (
    <CustomerPicker
      compact={isBar}
      customers={customers}
      employeeId={employeeId}
      orderType={orderType}
      selectedCustomer={selectedCustomer}
      onSelectCustomer={setSelectedCustomer}
      domicilioAddress={domicilioAddress}
      onDomicilioAddressChange={setDomicilioAddress}
      domicilioOrigen={domicilioOrigen}
      onDomicilioOrigenChange={setDomicilioOrigen}
      allergenSuggestions={allergenSuggestions}
    />
  );

  if (!isBar) {
    return (
      <div className="flex flex-col gap-3">
        {orderTypeControl}
        {tableField}
        {customerPicker}
      </div>
    );
  }

  // Barra: fila 1 tipo de orden + botones de caja; fila 2 mesa/nombre +
  // buscador de cliente; fila 3 (solo con cliente) sus datos en una línea.
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {orderTypeControl}
        {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {tableField}
        {customerPicker}
      </div>
    </div>
  );
}
