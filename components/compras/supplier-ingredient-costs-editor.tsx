"use client";

import { useEffect, useState, useTransition } from "react";
import type { UnitOfMeasure } from "@prisma/client";
import type { SupplierIngredientLink, IngredientOption } from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { upsertIngredientSupplier as upsertIngredientSupplierAction } from "@/actions/purchases";
import { unitLabels } from "./enum-labels";
import { withActionErrors } from "@/lib/action-result";
import { formatCurrency } from "@/lib/utils";
import { roundQty } from "@/lib/units";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const upsertIngredientSupplier = withActionErrors(upsertIngredientSupplierAction);

type Row = {
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  cost: string;
  isSelected: boolean;
  dirty: boolean;
};

function toRow(link: SupplierIngredientLink): Row {
  return {
    ingredientId: link.ingredientId,
    ingredientName: link.ingredientName,
    baseUnit: link.baseUnit,
    cost: String(link.cost),
    isSelected: link.isSelected,
    dirty: false,
  };
}

// Costos que cotiza el proveedor por insumo. Antes cada renglón tenía su
// propio botón "Guardar"; ahora se edita todo y se guarda una vez, con
// aviso si se intenta salir con cambios sin guardar (mejora D9).
//
// El costo se cotiza siempre por la unidad base del insumo (la misma con
// la que se descuenta inventario y se costean recetas); junto a cada uno se
// muestra su equivalente por presentación de compra (ej. $0.03/ml = $30
// por L) para que sea fácil comparar contra la factura.
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
  const [rows, setRows] = useState<Row[]>(links.map(toRow));
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const presentationById = new Map(ingredientOptions.map((i) => [i.id, i.presentation]));
  const linkedIds = new Set(rows.map((r) => r.ingredientId));
  const availableToAdd = ingredientOptions.filter((i) => !linkedIds.has(i.id));
  const dirtyRows = rows.filter((r) => r.dirty);

  useEffect(() => {
    if (dirtyRows.length === 0) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyRows.length]);

  function updateRow(ingredientId: string, patch: Partial<Row>) {
    setSavedMessage(null);
    setRows((prev) => prev.map((r) => (r.ingredientId === ingredientId ? { ...r, ...patch, dirty: true } : r)));
  }

  function addIngredient(ingredientId: string) {
    const ingredient = ingredientOptions.find((i) => i.id === ingredientId);
    if (!ingredient) return;
    setSavedMessage(null);
    setRows((prev) =>
      [
        ...prev,
        {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          baseUnit: ingredient.baseUnit,
          cost: "",
          isSelected: true,
          dirty: true,
        },
      ].sort((a, b) => a.ingredientName.localeCompare(b.ingredientName))
    );
  }

  function handleSaveAll() {
    setError(null);
    setSavedMessage(null);
    const invalid = dirtyRows.find((r) => !(Number(r.cost) > 0));
    if (invalid) {
      setError(`${invalid.ingredientName}: el costo debe ser mayor a cero.`);
      return;
    }
    startTransition(async () => {
      const saved: string[] = [];
      try {
        for (const row of dirtyRows) {
          await upsertIngredientSupplier({
            employeeId,
            supplierId,
            ingredientId: row.ingredientId,
            cost: Number(row.cost),
            costUnit: row.baseUnit as UnitOfMeasure,
            isSelected: row.isSelected,
          });
          saved.push(row.ingredientId);
        }
        setSavedMessage(`Guardado${saved.length === 1 ? "" : "s"} ${saved.length} costo${saved.length === 1 ? "" : "s"}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron guardar los costos.");
      } finally {
        setRows((prev) => prev.map((r) => (saved.includes(r.ingredientId) ? { ...r, dirty: false } : r)));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin ingredientes ligados todavía.</p>}

      {rows.length > 0 && (
        <div className="hidden items-center gap-2 text-xs font-medium text-muted-foreground sm:flex">
          <span className="flex-1">Insumo</span>
          <span className="w-28">Costo por unidad base</span>
          <span className="w-28">Equivale a</span>
          <span className="w-24">Costo activo</span>
        </div>
      )}

      {rows.map((row) => {
        const unit = unitLabels[row.baseUnit as keyof typeof unitLabels] ?? row.baseUnit;
        const presentation = presentationById.get(row.ingredientId) ?? null;
        const cost = Number(row.cost) || 0;
        return (
          <div
            key={row.ingredientId}
            className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm last:border-0 sm:flex-nowrap"
          >
            <span className="min-w-[8rem] flex-1">
              {row.ingredientName}
              {row.dirty && <span className="ml-1 text-xs text-primary">• sin guardar</span>}
            </span>
            <div className="flex w-28 items-center gap-1">
              <Input
                className="w-20"
                type="number"
                min="0"
                step="any"
                aria-label={`Costo de ${row.ingredientName} por ${unit}`}
                value={row.cost}
                onChange={(e) => updateRow(row.ingredientId, { cost: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">/{unit}</span>
            </div>
            <span className="w-28 text-xs text-muted-foreground">
              {presentation && cost > 0
                ? `${formatCurrency(roundQty(cost * presentation.size))} por ${presentation.name}`
                : "—"}
            </span>
            <label className="flex w-24 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={row.isSelected}
                onChange={(e) => updateRow(row.ingredientId, { isSelected: e.target.checked })}
              />
              activo
            </label>
          </div>
        );
      })}

      {availableToAdd.length > 0 && (
        <Combobox
          aria-label="Agregar insumo que surte este proveedor"
          placeholder="+ Agregar insumo…"
          value={null}
          onChange={addIngredient}
          options={availableToAdd.map((i) => ({ value: i.id, label: i.name }))}
        />
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {savedMessage && <Alert variant="success">{savedMessage}</Alert>}

      <Button type="button" onClick={handleSaveAll} disabled={isPending || dirtyRows.length === 0}>
        {isPending
          ? "Guardando..."
          : dirtyRows.length === 0
            ? "Sin cambios por guardar"
            : `Guardar costos (${dirtyRows.length})`}
      </Button>
    </div>
  );
}
