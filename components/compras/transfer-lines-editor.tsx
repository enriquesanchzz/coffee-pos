"use client";

import type { IngredientOption } from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { unitLabels } from "./enum-labels";

export type TransferLineDraft = {
  key: string;
  ingredientId: string;
  quantity: string;
};

export function emptyTransferLine(): TransferLineDraft {
  return { key: crypto.randomUUID(), ingredientId: "", quantity: "1" };
}

// Estado inicial del formulario (useState corre en SSR y al hidratar) — key
// fijo, ver la misma nota en components/recetas/recipe-lines-editor.tsx.
export function initialTransferLine(): TransferLineDraft {
  return { key: "line-inicial", ingredientId: "", quantity: "1" };
}

export function TransferLinesEditor({
  lines,
  onChange,
  ingredients,
}: {
  lines: TransferLineDraft[];
  onChange: (lines: TransferLineDraft[]) => void;
  ingredients: IngredientOption[];
}) {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  function updateLine(key: string, patch: Partial<TransferLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line) => {
        const ingredient = ingredientById.get(line.ingredientId);
        return (
          <div key={line.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Combobox
              className="w-full sm:w-auto sm:flex-1"
              aria-label="Insumo a transferir"
              placeholder="Insumo…"
              value={line.ingredientId || null}
              onChange={(ingredientId) => updateLine(line.key, { ingredientId })}
              options={ingredients.map((i) => ({ value: i.id, label: i.name }))}
            />

            <Input
              type="number"
              min="0"
              step="0.01"
              className="w-24"
              aria-label="Cantidad a transferir"
              value={line.quantity}
              onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
            />
            <span className="w-12 text-sm text-muted-foreground">
              {ingredient ? unitLabels[ingredient.baseUnit as keyof typeof unitLabels] : ""}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
            >
              Quitar
            </Button>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyTransferLine()])}>
        + Agregar ingrediente
      </Button>
    </div>
  );
}
