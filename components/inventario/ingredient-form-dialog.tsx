"use client";

import { useEffect, useState, useTransition } from "react";
import type { UnitOfMeasure } from "@prisma/client";
import type { InventoryOverviewItem, IngredientCategoryOption } from "@/lib/inventory";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createIngredient as createIngredientAction } from "@/actions/recipes";
import { updateIngredient as updateIngredientAction, deleteIngredient as deleteIngredientAction } from "@/actions/inventory";
import { unitLabels } from "./unit-labels";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createIngredient = withActionErrors(createIngredientAction);
const updateIngredient = withActionErrors(updateIngredientAction);
const deleteIngredient = withActionErrors(deleteIngredientAction);

const units = Object.keys(unitLabels) as UnitOfMeasure[];

// Crea o edita un insumo (create vs edit según si `ingredient` viene o no)
// — mismo diálogo para ambos casos, como EditCategoryDialog en Productos.
export function IngredientFormDialog({
  open,
  ingredient,
  categories,
  defaultCategoryId,
  employeeId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  ingredient: InventoryOverviewItem | null;
  categories: IngredientCategoryOption[];
  defaultCategoryId?: string;
  employeeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(ingredient);
  const [name, setName] = useState(ingredient?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    ingredient?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? ""
  );
  const [baseUnit, setBaseUnit] = useState<UnitOfMeasure>((ingredient?.baseUnit as UnitOfMeasure) ?? units[0]);
  const [purchaseUnit, setPurchaseUnit] = useState<UnitOfMeasure>(
    (ingredient?.purchaseUnit as UnitOfMeasure) ?? units[0]
  );
  const [tracksExpiration, setTracksExpiration] = useState(ingredient?.tracksExpiration ?? true);
  const [extraUnitPrice, setExtraUnitPrice] = useState(ingredient?.extraUnitPrice?.toString() ?? "");
  const [presentationName, setPresentationName] = useState(ingredient?.purchasePresentationName ?? "");
  const [presentationSize, setPresentationSize] = useState(ingredient?.purchasePresentationSize?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Los dos diálogos (crear/editar) quedan montados de forma permanente en
  // InventoryWorkspace, con `open`/`ingredient`/`defaultCategoryId` cambiando
  // por prop — un useState inicial NO se vuelve a evaluar en cada apertura,
  // así que hay que resincronizar los campos con un efecto cuando `open`
  // pasa a true (mismo patrón que AdjustStockDialog). Bug real encontrado
  // en la verificación: sin esto, "+ Nuevo insumo" en cualquier categoría
  // creaba siempre en la primera categoría de la lista, no en la que se
  // estaba viendo.
  useEffect(() => {
    if (!open) return;
    setName(ingredient?.name ?? "");
    setCategoryId(ingredient?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
    setBaseUnit((ingredient?.baseUnit as UnitOfMeasure) ?? units[0]);
    setPurchaseUnit((ingredient?.purchaseUnit as UnitOfMeasure) ?? units[0]);
    setTracksExpiration(ingredient?.tracksExpiration ?? true);
    setExtraUnitPrice(ingredient?.extraUnitPrice?.toString() ?? "");
    setPresentationName(ingredient?.purchasePresentationName ?? "");
    setPresentationSize(ingredient?.purchasePresentationSize?.toString() ?? "");
    setError(null);
    setConfirmingDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ingredient, defaultCategoryId]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  const parsedExtraPrice = extraUnitPrice.trim() === "" ? null : Number(extraUnitPrice);
  // Al crear, el precio se expresa por baseUnit (la dosis estándar se
  // configura después desde Productos); al editar, por la unidad ya fijada.
  const extraPriceUnitLabel = unitLabels[(ingredient?.extraPriceUnit as UnitOfMeasure) ?? baseUnit] ?? baseUnit;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && ingredient) {
          await updateIngredient({
            employeeId,
            ingredientId: ingredient.id,
            name,
            categoryId,
            baseUnit,
            purchaseUnit,
            tracksExpiration,
            extraUnitPrice: parsedExtraPrice,
            purchasePresentationName: presentationName,
            purchasePresentationSize: presentationSize.trim() === "" ? null : Number(presentationSize),
          });
        } else {
          await createIngredient({
            employeeId,
            name,
            categoryId,
            baseUnit,
            purchaseUnit,
            extraUnitPrice: parsedExtraPrice,
            purchasePresentationName: presentationName,
            purchasePresentationSize: presentationSize.trim() === "" ? null : Number(presentationSize),
          });
        }
        onSaved();
        handleOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el insumo.");
      }
    });
  }

  function handleDelete() {
    if (!ingredient) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteIngredient({ employeeId, ingredientId: ingredient.id });
        onSaved();
        handleOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo borrar el insumo.");
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title={isEdit ? "Editar insumo" : "Nuevo insumo"}>
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
          <Select id="ingredient-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
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

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Presentación de compra (opcional)</legend>
          <p className="text-xs text-muted-foreground">
            Para capturar órdenes de compra por caja, bolsa, garrafa… Si la dejas vacía se compra por{" "}
            {unitLabels[purchaseUnit]} (o {unitLabels[baseUnit]}).
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Nombre de la presentación"
              value={presentationName}
              onChange={(e) => setPresentationName(e.target.value)}
              placeholder="ej. Caja 12 L"
            />
            <Input
              aria-label={`Contenido de la presentación en ${unitLabels[baseUnit]}`}
              type="number"
              min="0"
              step="any"
              className="w-32"
              value={presentationSize}
              onChange={(e) => setPresentationSize(e.target.value)}
              placeholder={`ej. 12000 ${unitLabels[baseUnit]}`}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <Label htmlFor="ingredient-extra-price">
            Precio al cliente como extra (por {extraPriceUnitLabel}, opcional)
          </Label>
          <Input
            id="ingredient-extra-price"
            type="number"
            min="0"
            step="0.01"
            value={extraUnitPrice}
            onChange={(e) => setExtraUnitPrice(e.target.value)}
            placeholder="Vacío = costo ÷ % de food cost objetivo"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tracksExpiration}
            onChange={(e) => setTracksExpiration(e.target.checked)}
          />
          Da seguimiento a caducidad
        </label>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={isPending} className="flex-1">
            {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear insumo"}
          </Button>
          {isEdit &&
            (confirmingDelete ? (
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                ¿Borrar?
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setConfirmingDelete(true)} disabled={isPending}>
                Borrar
              </Button>
            ))}
        </div>
      </div>
    </Dialog>
  );
}
