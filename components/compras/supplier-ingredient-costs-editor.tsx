"use client";

import { useState, useTransition } from "react";
import type { UnitOfMeasure } from "@prisma/client";
import type { SupplierIngredientLink, IngredientOption } from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { upsertIngredientSupplier } from "@/actions/purchases";
import { unitLabels } from "./enum-labels";

function LinkRow({
  supplierId,
  employeeId,
  ingredientId,
  ingredientName,
  baseUnit,
  initial,
  onSaved,
}: {
  supplierId: string;
  employeeId: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  initial?: { cost: number; costUnit: string; isSelected: boolean };
  onSaved: (link: SupplierIngredientLink) => void;
}) {
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [costUnit, setCostUnit] = useState<UnitOfMeasure>(
    (initial?.costUnit as UnitOfMeasure) ?? (baseUnit as UnitOfMeasure)
  );
  const [isSelected, setIsSelected] = useState(initial?.isSelected ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await upsertIngredientSupplier({
          employeeId,
          supplierId,
          ingredientId,
          cost: Number(cost) || 0,
          costUnit,
          isSelected,
        });
        onSaved({
          id: `${supplierId}:${ingredientId}`,
          ingredientId,
          ingredientName,
          baseUnit,
          cost: Number(cost) || 0,
          costUnit,
          isSelected,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border py-2 last:border-0">
      <div className="flex items-center gap-2 text-sm">
        <span className="flex-1">{ingredientName}</span>
        <Input
          className="w-24"
          type="number"
          min="0"
          step="0.0001"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="Costo"
        />
        <Select
          className="w-24"
          value={costUnit}
          onChange={(e) => setCostUnit(e.target.value as UnitOfMeasure)}
        >
          {Object.entries(unitLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => setIsSelected(e.target.checked)}
          />
          costo activo
        </label>
        <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SupplierIngredientCostsEditor({
  supplierId,
  employeeId,
  links,
  ingredientOptions,
}: {
  supplierId: string;
  employeeId: string;
  links: SupplierIngredientLink[];
  ingredientOptions: IngredientOption[];
}) {
  const [savedLinks, setSavedLinks] = useState(links);
  const [addingIngredientId, setAddingIngredientId] = useState("");

  const linkedIds = new Set(savedLinks.map((l) => l.ingredientId));
  const availableToAdd = ingredientOptions.filter((i) => !linkedIds.has(i.id));
  const addingIngredient = ingredientOptions.find((i) => i.id === addingIngredientId);

  function upsertLocal(link: SupplierIngredientLink) {
    setSavedLinks((prev) => {
      const others = prev.filter((l) => l.ingredientId !== link.ingredientId);
      const adjusted = link.isSelected ? others.map((l) => ({ ...l, isSelected: false })) : others;
      return [...adjusted, link].sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
    });
    setAddingIngredientId("");
  }

  return (
    <div className="flex flex-col gap-2">
      {savedLinks.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin ingredientes ligados todavía.</p>
      )}

      {savedLinks.map((link) => (
        <LinkRow
          key={link.ingredientId}
          supplierId={supplierId}
          employeeId={employeeId}
          ingredientId={link.ingredientId}
          ingredientName={link.ingredientName}
          baseUnit={link.baseUnit}
          initial={{ cost: link.cost, costUnit: link.costUnit, isSelected: link.isSelected }}
          onSaved={upsertLocal}
        />
      ))}

      {availableToAdd.length > 0 && (
        <Select
          value={addingIngredientId}
          onChange={(e) => setAddingIngredientId(e.target.value)}
        >
          <option value="">+ Agregar ingrediente…</option>
          {availableToAdd.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      )}

      {addingIngredient && (
        <LinkRow
          key={`new-${addingIngredient.id}`}
          supplierId={supplierId}
          employeeId={employeeId}
          ingredientId={addingIngredient.id}
          ingredientName={addingIngredient.name}
          baseUnit={addingIngredient.baseUnit}
          onSaved={upsertLocal}
        />
      )}
    </div>
  );
}
