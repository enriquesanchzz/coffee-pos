"use client";

import { useState } from "react";
import type { UnitOfMeasure } from "@prisma/client";
import type { IngredientOption, ComposedRecipeOption } from "@/lib/recipes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CreateIngredientDialog } from "./create-ingredient-dialog";
import { unitLabels } from "./enum-labels";
import { unitStep } from "@/lib/utils";

export type LineDraft = {
  key: string;
  ref: string; // "ingredient:<id>" | "composed:<id>" | ""
  quantity: string;
  unit: UnitOfMeasure;
};

export function emptyLine(): LineDraft {
  return { key: crypto.randomUUID(), ref: "", quantity: "1", unit: "PIEZA" };
}

// Para el estado inicial de un formulario (useState se ejecuta tanto en SSR
// como al hidratar en el cliente) — crypto.randomUUID() ahí produciría un
// key distinto en cada corrida y rompería la hidratación. Solo usar esto
// para la primera línea que existe al montar; las líneas agregadas después
// vía "+ Agregar ingrediente" (solo ocurre en el cliente) sí usan
// emptyLine().
export function initialLine(): LineDraft {
  return { key: "line-inicial", ref: "", quantity: "1", unit: "PIEZA" };
}

export function RecipeLinesEditor({
  lines,
  onChange,
  ingredients,
  composedRecipes,
  onIngredientCreated,
  employeeId,
}: {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  ingredients: IngredientOption[];
  composedRecipes: ComposedRecipeOption[];
  onIngredientCreated: (ingredient: IngredientOption) => void;
  employeeId: string;
}) {
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  function updateLine(key: string, patch: Partial<LineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line) => {
        const [kind, refId] = line.ref.split(":");
        const ingredient = kind === "ingredient" ? ingredientById.get(refId) : undefined;

        return (
          <div key={line.key} className="flex items-center gap-2">
            <Select
              className="flex-1"
              value={line.ref}
              onChange={(e) => {
                const ref = e.target.value;
                const [refKind, refId] = ref.split(":");
                const selectedIngredient =
                  refKind === "ingredient" ? ingredientById.get(refId) : undefined;
                updateLine(line.key, {
                  ref,
                  // La unidad de una línea de ingrediente atómico siempre es
                  // fija — su dosis estándar si tiene (ej. "1 pump" de
                  // vainilla) o si no su baseUnit — ver nota en
                  // actions/recipes.ts sobre por qué no se deja elegir
                  // libremente (evita romper la conversión al vender, que
                  // exige un UnitConversion registrado).
                  ...(selectedIngredient
                    ? {
                        unit: (selectedIngredient.standardDoseUnit ??
                          selectedIngredient.baseUnit) as UnitOfMeasure,
                        quantity: String(selectedIngredient.standardDoseQuantity ?? 1),
                      }
                    : {}),
                });
              }}
            >
              <option value="">Selecciona un ingrediente…</option>
              <optgroup label="Ingredientes">
                {ingredients.map((i) => (
                  <option key={i.id} value={`ingredient:${i.id}`}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
              {composedRecipes.length > 0 && (
                <optgroup label="Ingredientes compuestos">
                  {composedRecipes.map((r) => (
                    <option key={r.id} value={`composed:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>

            <Input
              type="number"
              min="0"
              step={unitStep(ingredient ? ingredient.standardDoseUnit ?? ingredient.baseUnit : line.unit)}
              className="w-24"
              value={line.quantity}
              onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
            />

            {ingredient ? (
              <span className="w-14 text-sm text-muted-foreground">
                {unitLabels[(ingredient.standardDoseUnit ?? ingredient.baseUnit) as UnitOfMeasure] ??
                  ingredient.standardDoseUnit ??
                  ingredient.baseUnit}
              </span>
            ) : (
              <Select
                className="w-24"
                value={line.unit}
                onChange={(e) => updateLine(line.key, { unit: e.target.value as UnitOfMeasure })}
              >
                {Object.entries(unitLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}

            <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.key)}>
              Quitar
            </Button>
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyLine()])}>
          + Agregar ingrediente
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setCreatingIngredient(true)}>
          + Nuevo ingrediente
        </Button>
      </div>

      <CreateIngredientDialog
        open={creatingIngredient}
        onOpenChange={setCreatingIngredient}
        onCreated={onIngredientCreated}
        employeeId={employeeId}
      />
    </div>
  );
}
