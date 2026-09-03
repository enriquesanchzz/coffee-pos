"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DiscountType } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createDiscountCode } from "@/actions/discounts";

const discountTypeLabels: Record<DiscountType, string> = {
  PORCENTAJE: "% porcentaje",
  MONTO_FIJO: "monto fijo",
  PRECIO_FINAL: "precio final",
};

export function DiscountCodeForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [type, setType] = useState<DiscountType>("PORCENTAJE");
  const [value, setValue] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await createDiscountCode({
          employeeId,
          code,
          type,
          value: Number(value) || 0,
          expiresAt: expiresAt || undefined,
        });
        router.push("/clientes/descuentos");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el código.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo código</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="code">Código</Label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ej. VERANO10" />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="type">Tipo</Label>
            <Select id="type" value={type} onChange={(e) => setType(e.target.value as DiscountType)}>
              {Object.entries(discountTypeLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor="value">Valor</Label>
            <Input id="value" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="expiresAt">Expira (opcional)</Label>
          <Input id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Creando..." : "Crear código"}
        </Button>
      </CardContent>
    </Card>
  );
}
