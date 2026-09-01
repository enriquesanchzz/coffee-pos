"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SupplierDetail, IngredientOption } from "@/lib/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupplier, updateSupplier } from "@/actions/purchases";
import { SupplierIngredientCostsEditor } from "./supplier-ingredient-costs-editor";

export function SupplierForm({
  employeeId,
  supplier,
  ingredientOptions,
}: {
  employeeId: string;
  supplier?: SupplierDetail;
  ingredientOptions: IngredientOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(supplier);
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contact ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [minOrderAmount, setMinOrderAmount] = useState(
    supplier?.minOrderAmount ? String(supplier.minOrderAmount) : ""
  );
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        if (supplier) {
          await updateSupplier({
            employeeId,
            supplierId: supplier.id,
            name,
            contact,
            phone,
            email,
            isActive,
            minOrderAmount: minOrderAmount ? Number(minOrderAmount) : undefined,
          });
          router.refresh();
        } else {
          const result = await createSupplier({
            employeeId,
            name,
            contact,
            phone,
            email,
            minOrderAmount: minOrderAmount ? Number(minOrderAmount) : undefined,
          });
          router.push(`/compras/proveedores/${result.id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el proveedor.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">
        {isEdit ? `Editar — ${supplier!.name}` : "Nuevo proveedor"}
      </h1>

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
            <Label htmlFor="contact">Contacto</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
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
            <Label htmlFor="minOrderAmount">Mínimo de orden ($, opcional)</Label>
            <Input
              id="minOrderAmount"
              type="number"
              min="0"
              step="0.01"
              value={minOrderAmount}
              onChange={(e) => setMinOrderAmount(e.target.value)}
            />
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Activo
            </label>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear proveedor"}
      </Button>

      {isEdit && supplier && (
        <Card>
          <CardHeader>
            <CardTitle>Ingredientes que surte</CardTitle>
          </CardHeader>
          <CardContent>
            <SupplierIngredientCostsEditor
              supplierId={supplier.id}
              employeeId={employeeId}
              links={supplier.ingredientLinks}
              ingredientOptions={ingredientOptions}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
