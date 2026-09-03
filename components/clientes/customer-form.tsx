"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDetail } from "@/lib/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomer, updateCustomer } from "@/actions/customers";

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
  const [birthDate, setBirthDate] = useState(customer?.birthDate?.slice(0, 10) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
            birthDate: birthDate || undefined,
          });
          router.refresh();
        } else {
          const result = await createCustomer({
            employeeId,
            name,
            phone,
            email,
            birthDate: birthDate || undefined,
          });
          router.push(`/clientes/${result.id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
      }
    });
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
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="birthDate">Fecha de nacimiento (opcional)</Label>
          <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </CardContent>
    </Card>
  );
}
