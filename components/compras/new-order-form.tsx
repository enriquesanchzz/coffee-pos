"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UnitOfMeasure } from "@prisma/client";
import type { ActiveSupplierOption, IngredientOption, PurchaseOrderDetail } from "@/lib/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createPurchaseOrder as createPurchaseOrderAction, updatePurchaseOrder as updatePurchaseOrderAction } from "@/actions/purchases";
import { OrderLinesEditor, initialOrderLine, type OrderLineDraft } from "./order-lines-editor";
import { withActionErrors } from "@/lib/action-result";
import { roundQty } from "@/lib/units";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createPurchaseOrder = withActionErrors(createPurchaseOrderAction);
const updatePurchaseOrder = withActionErrors(updatePurchaseOrderAction);

// `existingOrder` la vuelve un formulario de edición (solo tiene sentido
// para una orden en CREADA, ver updatePurchaseOrder) en vez de creación —
// mismo formulario para ambos casos, como el resto de los diálogos
// crear/editar del proyecto.
export function NewOrderForm({
  employeeId,
  suppliers,
  ingredients,
  supplierCostsBySupplier,
  existingOrder,
  onSaved,
}: {
  employeeId: string;
  suppliers: ActiveSupplierOption[];
  ingredients: IngredientOption[];
  supplierCostsBySupplier: Record<string, Record<string, number>>;
  existingOrder?: PurchaseOrderDetail;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(existingOrder);
  const [supplierId, setSupplierId] = useState(existingOrder?.supplierId ?? suppliers[0]?.id ?? "");
  // Las líneas se capturan en la presentación de compra del insumo (ver
  // lib/units.ts); al editar, lo guardado en baseUnit se convierte de vuelta.
  const [lines, setLines] = useState<OrderLineDraft[]>(
    existingOrder
      ? existingOrder.items.map((item) => {
          const size = ingredients.find((i) => i.id === item.ingredientId)?.presentation?.size ?? 1;
          return {
            key: item.id,
            ingredientId: item.ingredientId,
            quantity: String(roundQty(item.orderedQuantity / size)),
            estimatedUnitCost: String(roundQty(item.estimatedUnitCost * size)),
          };
        })
      : [initialOrderLine()]
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supplierCosts = new Map(Object.entries(supplierCostsBySupplier[supplierId] ?? {}));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const validLines = lines.filter((l) => l.ingredientId);
        const linesInput = validLines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity) || 0,
          unit: ingredientById.get(l.ingredientId)!.baseUnit as UnitOfMeasure,
          estimatedUnitCost: Number(l.estimatedUnitCost) || 0,
        }));

        if (existingOrder) {
          await updatePurchaseOrder({
            employeeId,
            purchaseOrderId: existingOrder.id,
            supplierId,
            lines: linesInput,
          });
          onSaved?.();
        } else {
          const result = await createPurchaseOrder({ employeeId, supplierId, lines: linesInput });
          router.push(`/compras/${result.id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la orden.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      {!isEdit && <h1 className="text-lg font-semibold">Nueva orden de compra</h1>}

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
        {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear orden"}
      </Button>
    </div>
  );
}
