"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UnitOfMeasure } from "@prisma/client";
import type { ActiveSupplierOption, IngredientOption } from "@/lib/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createPurchaseOrder } from "@/actions/purchases";
import { OrderLinesEditor, initialOrderLine, type OrderLineDraft } from "./order-lines-editor";

export function NewOrderForm({
  employeeId,
  suppliers,
  ingredients,
  supplierCostsBySupplier,
}: {
  employeeId: string;
  suppliers: ActiveSupplierOption[];
  ingredients: IngredientOption[];
  supplierCostsBySupplier: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [lines, setLines] = useState<OrderLineDraft[]>([initialOrderLine()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supplierCosts = new Map(Object.entries(supplierCostsBySupplier[supplierId] ?? {}));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const validLines = lines.filter((l) => l.ingredientId);
        const result = await createPurchaseOrder({
          employeeId,
          supplierId,
          lines: validLines.map((l) => ({
            ingredientId: l.ingredientId,
            quantity: Number(l.quantity) || 0,
            unit: ingredientById.get(l.ingredientId)!.baseUnit as UnitOfMeasure,
            estimatedUnitCost: Number(l.estimatedUnitCost) || 0,
          })),
        });
        router.push(`/compras/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear la orden.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">Nueva orden de compra</h1>

      <Card>
        <CardHeader>
          <CardTitle>Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingredientes a pedir</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderLinesEditor
            lines={lines}
            onChange={setLines}
            ingredients={ingredients}
            supplierCosts={supplierCosts}
          />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending || !supplierId}>
        {isPending ? "Creando..." : "Crear orden"}
      </Button>
    </div>
  );
}
