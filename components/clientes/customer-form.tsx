"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CustomerGender } from "@prisma/client";
import type { CustomerDetail } from "@/lib/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createCustomer as createCustomerAction, updateCustomer as updateCustomerAction } from "@/actions/customers";
import { buildWhatsAppLoyaltyLink, cn } from "@/lib/utils";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createCustomer = withActionErrors(createCustomerAction);
const updateCustomer = withActionErrors(updateCustomerAction);

const GENDER_OPTIONS: { value: CustomerGender | ""; label: string }[] = [
  { value: "", label: "Prefiere no decir" },
  { value: "FEMENINO", label: "Femenino" },
  { value: "MASCULINO", label: "Masculino" },
  { value: "OTRO", label: "Otro" },
];

export function CustomerForm({
  employeeId,
  customer,
}: {
  employeeId: string;
  customer?: CustomerDetail;
}) {
  const router = useRouter();
  const isEdit = Boolean(customer);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [birthDate, setBirthDate] = useState(customer?.birthDate?.slice(0, 10) ?? "");
  const [gender, setGender] = useState<CustomerGender | "">((customer?.gender as CustomerGender) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Tras crear (no editar) un cliente nuevo, se queda en esta pantalla
  // para poder mandarle la tarjeta por WhatsApp antes de navegar.
  const [created, setCreated] = useState<{
    id: string;
    loyaltyCardCode: string;
    welcomeCouponCode: string;
  } | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        if (customer) {
          await updateCustomer({
            employeeId,
            customerId: customer.id,
            name,
            phone,
            email,
            address,
            // "" borra la fecha/género (updateCustomer es parcial).
            birthDate,
            gender: gender || null,
          });
          router.refresh();
        } else {
          const result = await createCustomer({
            employeeId,
            name,
            phone,
            email,
            address: address || undefined,
            birthDate: birthDate || undefined,
            gender: gender || undefined,
          });
          setCreated(result);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
      }
    });
  }

  if (created) {
    const whatsappLink = buildWhatsAppLoyaltyLink({
      phone,
      origin: window.location.origin,
      loyaltyCardCode: created.loyaltyCardCode,
      welcomeCouponCode: created.welcomeCouponCode,
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle>Cliente creado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {name} ya tiene su tarjeta de lealtad y un cupón de 10% para su próxima compra
            (código <span className="font-mono">{created.welcomeCouponCode}</span>).
          </p>
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              )}
            >
              Enviar tarjeta por WhatsApp
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              No se capturó un teléfono válido — no se puede armar el link de WhatsApp.
            </p>
          )}
          <Button variant="outline" onClick={() => router.push(`/clientes/${created.id}`)}>
            Continuar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" type="tel" inputMode="tel" placeholder="10 dígitos" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="address">Domicilio (opcional, para pedidos a domicilio)</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="birthDate">Fecha de nacimiento (opcional)</Label>
          <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gender">Género (opcional, solo para estadísticas)</Label>
          <Select
            id="gender"
            value={gender}
            onChange={(e) => setGender(e.target.value as CustomerGender | "")}
          >
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </CardContent>
    </Card>
  );
}
