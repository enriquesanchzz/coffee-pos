"use client";

import { useState, useTransition } from "react";
import type { UnitOfMeasure } from "@prisma/client";
import type { IngredientOption, IngredientCategoryOption } from "@/lib/recipes";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createIngredient as createIngredientAction } from "@/actions/recipes";
import { unitLabels } from "./enum-labels";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createIngredient = withActionErrors(createIngredientAction);

const units = Object.keys(unitLabels) as UnitOfMeasure[];

export function CreateIngredientDialog({
  open,
  onOpenChange,
  onCreated,
  employeeId,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ingredient: IngredientOption) => void;
  employeeId: string;
  categories: IngredientCategoryOption[];
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [baseUnit, setBaseUnit] = useState<UnitOfMeasure>(units[0]);
  const [purchaseUnit, setPurchaseUnit] = useState<UnitOfMeasure>(units[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const ingredient = await createIngredient({
          employeeId,
          name,
          categoryId,
          baseUnit,
          purchaseUnit,
        });
        onCreated(ingredient);
        setName("");
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el ingrediente.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nuevo ingrediente">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ingredient-name">Nombre</Label>
          <Input
            id="ingredient-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej. Canela en polvo"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="ingredient-category">Categoría</Label>
          <Select
            id="ingredient-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="ingredient-base-unit">Unidad base (con la que se descuenta inventario)</Label>
          <Select
            id="ingredient-base-unit"
            value={baseUnit}
            onChange={(e) => setBaseUnit(e.target.value as UnitOfMeasure)}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {unitLabels[u]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="ingredient-purchase-unit">Unidad de compra</Label>
          <Select
            id="ingredient-purchase-unit"
            value={purchaseUnit}
            onChange={(e) => setPurchaseUnit(e.target.value as UnitOfMeasure)}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {unitLabels[u]}
              </option>
            ))}
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleConfirm} disabled={isPending}>
          {isPending ? "Creando..." : "Crear ingrediente"}
        </Button>
      </div>
    </Dialog>
  );
}
