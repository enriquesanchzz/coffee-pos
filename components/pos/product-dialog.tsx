"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SegmentedControl, SegmentedButton } from "@/components/ui/segmented-control";
import { FieldError } from "@/components/ui/field-error";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, posAccentClass, unitStep, unitLabel } from "@/lib/utils";
import {
  resolveProductVariant,
  type CatalogModifierOption,
  type CatalogProduct,
  type ExtraIngredientOption,
  type VariantTemperature,
} from "@/lib/catalog";
import type { CartExtraIngredient, CartModifier } from "./cart-store";
import { Combobox } from "@/components/ui/combobox";

const temperatureLabels: Record<VariantTemperature, string> = {
  CALIENTE: "Caliente",
  FRIO: "Frío",
  FRAPPE: "Frappé",
};

// Notas por producto: cortas, se imprimen/leen en barra (QA-014).
const NOTES_MAX = 140;

export function ProductDialog({
  product,
  open,
  onOpenChange,
  extraIngredientOptions,
  onAdd,
}: {
  product: CatalogProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extraIngredientOptions: ExtraIngredientOption[];
  onAdd: (input: {
    productVariantId: string;
    productName: string;
    variantName: string;
    imageUrl: string | null;
    unitBasePrice: number;
    modifiers: CartModifier[];
    extraIngredients: CartExtraIngredient[];
    notes: string;
  }) => void;
}) {
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<VariantTemperature | null>(null);
  // Por groupId: set de modifierOptionId seleccionados.
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = useState("");
  const [extras, setExtras] = useState<CartExtraIngredient[]>([]);
  const [addingExtraId, setAddingExtraId] = useState("");
  const [addingExtraQty, setAddingExtraQty] = useState("1");

  useEffect(() => {
    if (product && open) {
      const first = product.variants[0] ?? null;
      setSizeLabel(first?.sizeLabel ?? null);
      setTemperature(first?.temperature ?? null);
      // "Leche entera" (la opción base auto-generada, ver "Módulo
      // Productos") viene preseleccionada por default en el grupo "Tipo
      // de leche" — el cliente pide sustituir solo cuando de verdad
      // quiere otra leche. Se identifica por nombre de grupo (no solo
      // por isSubstitution:false, que "Extras" también usa para todas
      // sus opciones y esas NO deben preseleccionarse).
      const initialSelected: Record<string, Set<string>> = {};
      for (const group of first?.modifierGroups ?? []) {
        if (group.name !== "Tipo de leche") continue;
        const base = group.options.find((o) => !o.isSubstitution);
        if (base) initialSelected[group.id] = new Set([base.id]);
      }
      setSelected(initialSelected);
      setNotes("");
      setExtras([]);
      setAddingExtraId("");
      setAddingExtraQty("1");
    }
  }, [product, open]);

  // Ejes disponibles, derivados de las variantes del producto — tamaño
  // viene del nombre de la variante, temperatura de
  // ProductVariant.temperature (campo real, ver lib/catalog.ts). Un
  // producto que solo usa "Chico"/"Grande" (sin temperatura) se comporta
  // idéntico a un solo selector de tamaño.
  const sizes = useMemo(() => {
    if (!product) return [];
    const seen = new Set<string>();
    for (const v of product.variants) if (v.sizeLabel) seen.add(v.sizeLabel);
    return Array.from(seen);
  }, [product]);

  const temperatures = useMemo(() => {
    if (!product) return [];
    const seen = new Set<VariantTemperature>();
    for (const v of product.variants) if (v.temperature) seen.add(v.temperature);
    return Array.from(seen);
  }, [product]);

  const variant = useMemo(() => {
    if (!product) return null;
    return resolveProductVariant(product, sizeLabel, temperature);
  }, [product, sizeLabel, temperature]);

  const missingRequired = useMemo(() => {
    if (!variant) return [];
    return variant.modifierGroups.filter(
      (g) => g.isRequired && (selected[g.id]?.size ?? 0) === 0
    );
  }, [variant, selected]);

  if (!product) return null;

  const selectedExtraOption = extraIngredientOptions.find((o) => o.id === addingExtraId) ?? null;

  // Cantidad del extra (QA-018): mayor a cero y con un tope razonable — 10
  // dosis para unidades que se cuentan (shot, pump, pza) o 1000 para ml/g.
  const extraQtyNumber = Number(addingExtraQty);
  const extraUnit = selectedExtraOption?.standardDoseUnit ?? selectedExtraOption?.baseUnit;
  const extraMax = extraUnit && ["ML", "G", "L", "KG"].includes(extraUnit) ? 1000 : 10;
  const extraQtyError = !selectedExtraOption
    ? null
    : !(extraQtyNumber > 0)
      ? "La cantidad debe ser mayor a cero."
      : extraQtyNumber > extraMax
        ? `Máximo ${extraMax} ${unitLabel(extraUnit)} por producto.`
        : null;

  function handleSelectExtraOption(option: ExtraIngredientOption) {
    setAddingExtraId(option.id);
    // Dosis estándar (ej. "1 pump" de vainilla, "30 ml" de leche) en vez
    // de "1" del baseUnit crudo — ver Ingredient.standardDoseQuantity.
    setAddingExtraQty(String(option.standardDoseQuantity ?? 1));
  }

  function toggleOption(groupId: string, option: CatalogModifierOption, allowMultiple: boolean) {
    setSelected((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (allowMultiple) {
        if (current.has(option.id)) current.delete(option.id);
        else current.add(option.id);
      } else {
        // Opción única (ej. Tipo de leche): se comporta como radio, no se
        // puede quedar sin ninguna elegida (QA-019).
        current.clear();
        current.add(option.id);
      }
      return { ...prev, [groupId]: current };
    });
  }

  function handleAddExtra() {
    const option = extraIngredientOptions.find((i) => i.id === addingExtraId);
    const quantity = Number(addingExtraQty) || 0;
    if (!option || extraQtyError) return;
    setExtras((prev) => [
      ...prev,
      {
        ingredientId: option.id,
        name: option.name,
        quantity,
        unit: option.standardDoseUnit ?? option.baseUnit,
        // Vista previa — actions/pos.ts recalcula el precio real
        // (unitPrice ya viene por unidad de dosis estándar).
        priceDelta: Math.round(quantity * option.unitPrice * 100) / 100,
      },
    ]);
    setAddingExtraId("");
    setAddingExtraQty("1");
  }

  function removeExtra(index: number) {
    setExtras((prev) => prev.filter((_, i) => i !== index));
  }

  const selectedOptions: CatalogModifierOption[] = variant
    ? variant.modifierGroups.flatMap((g) =>
        g.options.filter((o) => selected[g.id]?.has(o.id))
      )
    : [];

  const total =
    (variant?.price ?? 0) +
    selectedOptions.reduce((sum, o) => sum + o.priceDelta, 0) +
    extras.reduce((sum, e) => sum + e.priceDelta, 0);

  function handleAdd() {
    if (!variant || missingRequired.length > 0) return;
    onAdd({
      productVariantId: variant.id,
      productName: product!.name,
      variantName: variant.name,
      imageUrl: product!.imageUrl,
      unitBasePrice: variant.price,
      modifiers: selectedOptions.map((o) => ({
        modifierOptionId: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
      })),
      extraIngredients: extras,
      notes: notes.trim(),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={product.name} placement="drawer">
      <div className="flex flex-col gap-4">
        {sizes.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Tamaño</p>
            <SegmentedControl
              label="Tamaño"
              options={sizes.map((size) => ({ value: size, label: size }))}
              value={sizeLabel}
              onChange={setSizeLabel}
            />
          </div>
        )}

        {temperatures.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Temperatura</p>
            <SegmentedControl
              label="Temperatura"
              options={temperatures.map((temp) => ({ value: temp, label: temperatureLabels[temp] }))}
              value={temperature}
              onChange={setTemperature}
            />
          </div>
        )}

        {!variant && (sizes.length > 0 || temperatures.length > 0) && (
          <Alert variant="error">Esta combinación no está disponible.</Alert>
        )}

        {variant?.modifierGroups.map((group) => (
          <div key={group.id}>
            <p className="mb-2 text-sm font-medium">
              {group.name}
              {group.isRequired && <span className="text-destructive"> *</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const isSelected = selected[group.id]?.has(option.id) ?? false;
                return (
                  <SegmentedButton
                    key={option.id}
                    selected={isSelected}
                    className="flex-none"
                    onClick={() => toggleOption(group.id, option, group.allowMultiple)}
                  >
                    {option.name}
                    {option.priceDelta !== 0 && ` (+${formatCurrency(option.priceDelta)})`}
                  </SegmentedButton>
                );
              })}
            </div>
          </div>
        ))}

        {!product?.isRetail && (
        <div>
          <p className="mb-2 text-sm font-medium">Agregar otro ingrediente</p>
          <div className="flex items-end gap-2">
            <Combobox
              className="flex-1"
              aria-label="Ingrediente extra"
              placeholder="Buscar ingrediente…"
              value={addingExtraId || null}
              onChange={(id) => {
                const option = extraIngredientOptions.find((o) => o.id === id);
                if (option) handleSelectExtraOption(option);
              }}
              options={extraIngredientOptions.map((ingredient) => ({
                value: ingredient.id,
                label: ingredient.name,
                description: `· ${unitLabel(ingredient.standardDoseUnit ?? ingredient.baseUnit)} · ${formatCurrency(ingredient.unitPrice)}`,
              }))}
            />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min="0"
                aria-label="Cantidad del extra"
                aria-invalid={extraQtyError ? true : undefined}
                aria-describedby={extraQtyError ? "extra-qty-error" : undefined}
                step={unitStep(
                  selectedExtraOption ? selectedExtraOption.standardDoseUnit ?? selectedExtraOption.baseUnit : undefined
                )}
                className="w-20"
                value={addingExtraQty}
                onChange={(e) => setAddingExtraQty(e.target.value)}
              />
              {selectedExtraOption && (
                <span className="text-xs text-muted-foreground">
                  {unitLabel(selectedExtraOption.standardDoseUnit ?? selectedExtraOption.baseUnit)}
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddExtra}
              disabled={!addingExtraId || extraQtyError !== null}
            >
              Agregar
            </Button>
          </div>
          <FieldError id="extra-qty-error">{extraQtyError}</FieldError>

          {extras.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {extras.map((extra, index) => (
                <li key={`${extra.ingredientId}-${index}`} className="flex items-center justify-between text-sm">
                  <span>
                    {extra.name} · {extra.quantity} {unitLabel(extra.unit)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>+{formatCurrency(extra.priceDelta)}</span>
                    <button
                      type="button"
                      onClick={() => removeExtra(index)}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "h-9" })}
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="item-notes">Notas (opcional)</Label>
          <Textarea
            id="item-notes"
            className="min-h-16"
            placeholder="sin azúcar, bien caliente"
            maxLength={NOTES_MAX}
            aria-describedby="item-notes-count"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p id="item-notes-count" className="text-right text-xs text-muted-foreground">
            {notes.length}/{NOTES_MAX}
          </p>
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex flex-col gap-3 border-t border-border bg-background p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="text-2xl font-bold">{formatCurrency(total)}</span>
          </div>

          <Button
            className={posAccentClass}
            onClick={handleAdd}
            disabled={!variant || missingRequired.length > 0}
          >
            Agregar al carrito
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
