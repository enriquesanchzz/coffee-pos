"use client";

import { useBusinessSettings } from "@/components/layout/business-settings-context";
import { useEffect, useState, useTransition } from "react";
import type { SaleOrderType, DomicilioOrigen } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, posAccentBorderClass, buildWhatsAppLoyaltyLink } from "@/lib/utils";
import { createCustomer as createCustomerAction } from "@/actions/customers";
import type { CustomerOption } from "@/lib/customers";
import { withActionErrors } from "@/lib/action-result";
import { Combobox } from "@/components/ui/combobox";

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
  // Lo que se teclea en el buscador — sirve para precargar "Crear X".
  const [customerQuery, setCustomerQuery] = useState("");
  // Clientes creados desde este mismo picker — el prop `customers` viene
  // del server component padre y no se refresca solo; se mezclan
  // localmente para que aparezcan de inmediato en esta misma venta.
  const [localCustomers, setLocalCustomers] = useState<CustomerOption[]>([]);
  const allCustomers = [...customers, ...localCustomers];
  const [justCreatedCustomer, setJustCreatedCustomer] = useState<{
    id: string;
    loyaltyCardCode: string;
    welcomeCouponCode: string | null;
  } | null>(null);

  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [isCreatingCustomer, startCreatingCustomer] = useTransition();


  function handleSelect(customer: CustomerOption) {
    onSelectCustomer(customer);
    onDomicilioAddressChange(customer.address ?? "");
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
      <Label htmlFor="customer">Cliente {orderType === "DOMICILIO" ? "(obligatorio)" : "(opcional)"}</Label>
      <Combobox
        id="customer"
        placeholder="Nombre, teléfono o tarjeta…"
        value={selectedCustomer?.id ?? null}
        onChange={(id) => {
          const customer = allCustomers.find((c) => c.id === id);
          if (customer) handleSelect(customer);
        }}
        onQueryChange={(query) => {
          setCustomerQuery(query);
          if (selectedCustomer && query) onSelectCustomer(null);
        }}
        options={allCustomers.map((c) => ({
          value: c.id,
          label: c.name,
          description: c.phone ? `· ${c.phone}` : undefined,
          keywords: [c.phone, c.loyaltyCode].filter(Boolean).join(" "),
        }))}
        emptyText="Ningún cliente coincide."
        action={{
          label: (query) => `+ Crear “${query}” como cliente nuevo`,
          onSelect: () => handleOpenNewCustomerForm(),
        }}
        inputClassName={cn(orderType === "DOMICILIO" && !selectedCustomer && "border-destructive")}
      />
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
          <Input
            aria-label="Nombre del cliente nuevo"
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            placeholder="Nombre"
          />
          <Input
            aria-label="Teléfono del cliente nuevo"
            type="tel"
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            placeholder={orderType === "DOMICILIO" ? "Teléfono (obligatorio)" : "Teléfono (opcional)"}
          />
          {newCustomerError && <p role="alert" className="text-sm text-destructive">{newCustomerError}</p>}
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
            <Label htmlFor="domicilio-address">Domicilio de entrega (obligatorio)</Label>
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
                  aria-pressed={domicilioOrigen === opt.value}
                  key={opt.value}
                  type="button"
                  onClick={() => onDomicilioOrigenChange(opt.value)}
                  className={cn(
                    "min-h-11 flex-1 rounded-md border border-border px-3 py-2 text-sm",
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
  welcomeCouponCode: string | null;
}) {
  const { businessName, welcomeCouponPercent } = useBusinessSettings();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    setHref(
      buildWhatsAppLoyaltyLink({
        phone,
        origin: window.location.origin,
        loyaltyCardCode,
        welcomeCouponCode,
        businessName,
        welcomeCouponPercent,
      })
    );
  }, [phone, loyaltyCardCode, welcomeCouponCode, businessName, welcomeCouponPercent]);

  if (!href) return null;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary underline">
      Enviar tarjeta por WhatsApp
    </a>
  );
}
