"use client";

import { useState, useTransition } from "react";
import type { IngredientCategory, UnitOfMeasure } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createIngredient } from "@/actions/recipes";
import { categoryLabels, unitLabels } from "./enum-labels";

const categories = Object.keys(categoryLabels) as IngredientCategory[];
const units = Object.keys(unitLabels) as UnitOfMeasure[];

export function CreateIngredientDialog({
  open,
  onOpenChange,
  onCreated,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ingredient: {
    id: string;
    name: string;
    category: string;
    baseUnit: string;
  }) => void;
  employeeId: string;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IngredientCategory>(categories[0]);
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
          category,
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
            value={category}
            onChange={(e) => setCategory(e.target.value as IngredientCategory)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
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
