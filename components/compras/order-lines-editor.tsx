"use client";

import type { IngredientOption } from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatUnitCost } from "@/lib/utils";
import { unitLabels } from "./enum-labels";

export type OrderLineDraft = {
  key: string;
  ingredientId: string;
  quantity: string;
  estimatedUnitCost: string;
};

export function emptyOrderLine(): OrderLineDraft {
  return { key: crypto.randomUUID(), ingredientId: "", quantity: "1", estimatedUnitCost: "0" };
}

// Estado inicial del formulario (useState corre en SSR y al hidratar) — key
// fijo, ver la misma nota en components/recetas/recipe-lines-editor.tsx.
export function initialOrderLine(): OrderLineDraft {
  return { key: "line-inicial", ingredientId: "", quantity: "1", estimatedUnitCost: "0" };
}

export function OrderLinesEditor({
  lines,
  onChange,
  ingredients,
  supplierCosts,
}: {
  lines: OrderLineDraft[];
  onChange: (lines: OrderLineDraft[]) => void;
  ingredients: IngredientOption[];
  supplierCosts: Map<string, number>;
}) {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  function updateLine(key: string, patch: Partial<OrderLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  // Las cantidades y costos van en la unidad base del insumo (la misma con
  // la que se descuenta inventario) — se muestra explícita en cada columna
  // para que "1000" no se confunda entre ml y L.
  const orderTotal = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.estimatedUnitCost) || 0),
    0
  );

  return (
    <div className="flex flex-col gap-2">
      {lines.length > 0 && (
        <div className="hidden items-center gap-2 text-xs font-medium text-muted-foreground sm:flex">
          <span className="flex-1">Insumo</span>
          <span className="w-24">Cantidad</span>
          <span className="w-12">Unidad</span>
          <span className="w-24">Costo por unidad</span>
          <span className="w-20 text-right">Subtotal</span>
          <span className="w-[68px]" />
        </div>
      )}
      {lines.map((line) => {
        const ingredient = ingredientById.get(line.ingredientId);
        const unit = ingredient ? unitLabels[ingredient.baseUnit as keyof typeof unitLabels] : "";
        const lineTotal = (Number(line.quantity) || 0) * (Number(line.estimatedUnitCost) || 0);
        return (
          <div key={line.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Select
              className="min-w-[10rem] flex-1"
              aria-label="Insumo"
              value={line.ingredientId}
              onChange={(e) => {
                const ingredientId = e.target.value;
                const suggestedCost = supplierCosts.get(ingredientId);
                updateLine(line.key, {
                  ingredientId,
                  ...(suggestedCost !== undefined ? { estimatedUnitCost: String(suggestedCost) } : {}),
                });
              }}
            >
              <option value="">Selecciona un ingrediente…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>

            <Input
              type="number"
              min="0"
              step="0.01"
              className="w-24"
              aria-label={`Cantidad${unit ? ` en ${unit}` : ""}`}
              value={line.quantity}
              onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
            />
            <span className="w-12 text-sm text-muted-foreground">{unit}</span>

            <Input
              type="number"
              min="0"
              step="0.0001"
              className="w-24"
              aria-label={`Costo por ${unit || "unidad"}`}
              value={line.estimatedUnitCost}
              onChange={(e) => updateLine(line.key, { estimatedUnitCost: e.target.value })}
              placeholder="Costo"
            />
            <span className="w-20 text-right text-sm">{formatCurrency(lineTotal)}</span>

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

      {lines.length > 0 && (
        <p className="text-right text-sm font-medium">Total estimado: {formatCurrency(orderTotal)}</p>
      )}
      {lines.some((line) => Number(line.estimatedUnitCost) > 0 && Number(line.estimatedUnitCost) < 1) && (
        <p className="text-xs text-muted-foreground">
          Costos como {formatUnitCost(0.03)} son por unidad base (ej. por ml), no por litro o paquete.
        </p>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyOrderLine()])}>
        + Agregar ingrediente
      </Button>
    </div>
  );
}
