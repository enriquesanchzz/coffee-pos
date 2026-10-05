"use client";

import { useEffect, useState, useTransition } from "react";
import type { SaleOrderType, DomicilioOrigen } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, posAccentBorderClass, buildWhatsAppLoyaltyLink } from "@/lib/utils";
import { createCustomer as createCustomerAction } from "@/actions/customers";
import type { CustomerOption } from "@/lib/customers";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createCustomer = withActionErrors(createCustomerAction);

// Selección/creación de cliente — vive en la comanda (CartPanel), debajo
// del selector de tipo de venta, en vez de estar escondida dentro del
// panel de cobro: para "A domicilio" en particular hace falta saber a
// quién entregarle desde que se arma la cuenta, no hasta que se va a
// cobrar. `domicilioAddress`/`domicilioOrigen` viven en el padre
// (CartPanel) porque CheckoutForm, un componente hermano, también los
// necesita al confirmar la venta.
export function CustomerPicker({
  customers,
  employeeId,
  orderType,
  selectedCustomer,
  onSelectCustomer,
  domicilioAddress,
  onDomicilioAddressChange,
  domicilioOrigen,
  onDomicilioOrigenChange,
}: {
  customers: CustomerOption[];
  employeeId: string;
  orderType: SaleOrderType;
  selectedCustomer: CustomerOption | null;
  onSelectCustomer: (customer: CustomerOption | null) => void;
  domicilioAddress: string;
  onDomicilioAddressChange: (value: string) => void;
  domicilioOrigen: DomicilioOrigen;
  onDomicilioOrigenChange: (value: DomicilioOrigen) => void;
}) {
  const [customerQuery, setCustomerQuery] = useState(selectedCustomer?.name ?? "");
  const [customerListOpen, setCustomerListOpen] = useState(false);
  // Clientes creados desde este mismo picker — el prop `customers` viene
  // del server component padre y no se refresca solo; se mezclan
  // localmente para que aparezcan de inmediato en esta misma venta.
  const [localCustomers, setLocalCustomers] = useState<CustomerOption[]>([]);
  const allCustomers = [...customers, ...localCustomers];
  const [justCreatedCustomer, setJustCreatedCustomer] = useState<{
    id: string;
    loyaltyCardCode: string;
    welcomeCouponCode: string;
  } | null>(null);

  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [isCreatingCustomer, startCreatingCustomer] = useTransition();

  const filteredCustomers = customerQuery.trim()
    ? allCustomers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
          c.phone?.includes(customerQuery) ||
          (c.loyaltyCode && c.loyaltyCode === customerQuery.trim())
      )
    : allCustomers;

  useEffect(() => {
    setCustomerQuery(selectedCustomer?.name ?? "");
  }, [selectedCustomer]);

  function handleSelect(customer: CustomerOption) {
    onSelectCustomer(customer);
    onDomicilioAddressChange(customer.address ?? "");
    setCustomerListOpen(false);
    setShowNewCustomerForm(false);
  }

  function handleClear() {
    onSelectCustomer(null);
    onDomicilioAddressChange("");
    setCustomerQuery("");
    setJustCreatedCustomer(null);
  }

  function handleOpenNewCustomerForm() {
    setNewCustomerName(customerQuery.trim());
    setNewCustomerPhone("");
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
    // Domicilio necesita teléfono para coordinar la entrega. La dirección
    // se captura después, en el bloque de domicilio del cliente ya
    // seleccionado — así el alta rápida queda en dos campos.
    if (orderType === "DOMICILIO" && !newCustomerPhone.trim()) {
      setNewCustomerError("Para domicilio, el teléfono es obligatorio.");
      return;
    }
    startCreatingCustomer(async () => {
      try {
        const created = await createCustomer({
          employeeId,
          name,
          phone: newCustomerPhone.trim() || undefined,
        });
        const option: CustomerOption = {
          id: created.id,
          name,
          phone: newCustomerPhone.trim() || null,
          address: null,
          loyaltyCode: created.loyaltyCardCode,
          birthDate: null,
          gender: null,
        };
        setLocalCustomers((prev) => [...prev, option]);
        handleSelect(option);
        setJustCreatedCustomer({
          id: created.id,
          loyaltyCardCode: created.loyaltyCardCode,
          welcomeCouponCode: created.welcomeCouponCode,
        });
      } catch (err) {
        setNewCustomerError(err instanceof Error ? err.message : "No se pudo crear el cliente.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="customer">Cliente (opcional)</Label>
      <div className="relative">
        <Input
          id="customer"
          value={customerQuery}
          onChange={(e) => {
            setCustomerQuery(e.target.value);
            if (selectedCustomer) onSelectCustomer(null);
            setCustomerListOpen(true);
          }}
          onFocus={() => setCustomerListOpen(true)}
          onBlur={() => setTimeout(() => setCustomerListOpen(false), 150)}
          placeholder="Buscar por nombre, teléfono o código de tarjeta…"
          autoComplete="off"
          className={cn(orderType === "DOMICILIO" && !selectedCustomer && "border-destructive")}
        />
        {customerListOpen && (filteredCustomers.length > 0 || customerQuery.trim()) && (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-background shadow-md">
            {filteredCustomers.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(customer)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {customer.name}
                  {customer.phone && <span className="text-muted-foreground"> · {customer.phone}</span>}
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
          <button type="button" onClick={handleClear} className="underline">
            quitar
          </button>
        </p>
      )}

      {justCreatedCustomer && justCreatedCustomer.id === selectedCustomer?.id && (
        <WhatsAppLoyaltyLink
          phone={selectedCustomer?.phone ?? ""}
          loyaltyCardCode={justCreatedCustomer.loyaltyCardCode}
          welcomeCouponCode={justCreatedCustomer.welcomeCouponCode}
        />
      )}

      {showNewCustomerForm && (
        <div className="mt-1 flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">Cliente nuevo</p>
          <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Nombre" />
          <Input
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            placeholder={orderType === "DOMICILIO" ? "Teléfono (obligatorio)" : "Teléfono (opcional)"}
          />
          {newCustomerError && <p className="text-sm text-destructive">{newCustomerError}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleCreateCustomer} disabled={isCreatingCustomer}>
              {isCreatingCustomer ? "Creando…" : "Crear y seleccionar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewCustomerForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {orderType === "DOMICILIO" && selectedCustomer && (
        <div className="mt-1 flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Teléfono:</span> {selectedCustomer.phone ?? "sin registrar"}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="domicilio-address">Domicilio de entrega</Label>
            <Input
              id="domicilio-address"
              value={domicilioAddress}
              onChange={(e) => onDomicilioAddressChange(e.target.value)}
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
                  onClick={() => onDomicilioOrigenChange(opt.value)}
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
    </div>
  );
}

// Link de "Enviar tarjeta por WhatsApp" para el cliente recién creado
// inline, sin interrumpir el cobro en curso — ver buildWhatsAppLoyaltyLink.
function WhatsAppLoyaltyLink({
  phone,
  loyaltyCardCode,
  welcomeCouponCode,
}: {
  phone: string;
  loyaltyCardCode: string;
  welcomeCouponCode: string;
}) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    setHref(
      buildWhatsAppLoyaltyLink({
        phone,
        origin: window.location.origin,
        loyaltyCardCode,
        welcomeCouponCode,
      })
    );
  }, [phone, loyaltyCardCode, welcomeCouponCode]);

  if (!href) return null;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary underline">
      Enviar tarjeta por WhatsApp
    </a>
  );
}
