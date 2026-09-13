"use client";

import type { UnitOfMeasure } from "@prisma/client";
import type { IngredientOption } from "@/lib/recipes";
import type { ModifierOptionInput } from "@/actions/recipes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { unitLabels } from "./enum-labels";

export type ModifierOptionDraft = {
  key: string;
  ingredientId: string;
  quantity: string;
  priceDelta: string;
};

export function emptyModifierOption(): ModifierOptionDraft {
  return { key: crypto.randomUUID(), ingredientId: "", quantity: "1", priceDelta: "0" };
}

export function modifierOptionsToInput(rows: ModifierOptionDraft[]): ModifierOptionInput[] {
  return rows
    .filter((r) => r.ingredientId)
    .map((r) => ({
      ingredientId: r.ingredientId,
      quantity: Number(r.quantity) || 0,
      priceDelta: Number(r.priceDelta) || 0,
    }));
}

// Editor genérico de filas {ingrediente, cantidad, precio} — usado para
// las secciones "Tipo de leche" (puntos 4) y "Extras" (punto 5) del
// formulario de variante. El ingrediente decide la unidad (igual que
// RecipeLinesEditor) — no se deja elegir libre para no romper la
// conversión al vender.
export function ModifierOptionsEditor({
  title,
  helpText,
  rows,
  onChange,
  ingredientOptions,
}: {
  title: string;
  helpText?: string;
  rows: ModifierOptionDraft[];
  onChange: (rows: ModifierOptionDraft[]) => void;
  ingredientOptions: IngredientOption[];
}) {
  const ingredientById = new Map(ingredientOptions.map((i) => [i.id, i]));

  function updateRow(key: string, patch: Partial<ModifierOptionDraft>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: string) {
    onChange(rows.filter((r) => r.key !== key));
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      </div>
      {rows.map((row) => {
        const ingredient = ingredientById.get(row.ingredientId);
        return (
          <div key={row.key} className="flex items-center gap-2">
            <Select
              className="flex-1"
              value={row.ingredientId}
              onChange={(e) => updateRow(row.key, { ingredientId: e.target.value })}
            >
              <option value="">Selecciona un ingrediente…</option>
              {ingredientOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="w-20"
              value={row.quantity}
              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
            />
            {ingredient && (
              <span className="w-10 text-xs text-muted-foreground">
                {unitLabels[ingredient.baseUnit as UnitOfMeasure] ?? ingredient.baseUnit}
              </span>
            )}
            <Input
              type="number"
              min="0"
              step="0.01"
              className="w-24"
              placeholder="Precio"
              value={row.priceDelta}
              onChange={(e) => updateRow(row.key, { priceDelta: e.target.value })}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
              Quitar
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, emptyModifierOption()])}
      >
        + Agregar opción
      </Button>
    </div>
  );
}
