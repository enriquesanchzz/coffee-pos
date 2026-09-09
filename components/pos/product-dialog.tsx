"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import type {
  CatalogModifierOption,
  CatalogProduct,
  CatalogVariant,
  ExtraIngredientOption,
  VariantTemperature,
} from "@/lib/catalog";
import type { CartExtraIngredient, CartModifier } from "./cart-store";

const temperatureLabels: Record<VariantTemperature, string> = {
  CALIENTE: "Caliente",
  FRIO: "Frío",
};

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
      setSelected({});
      setNotes("");
      setExtras([]);
      setAddingExtraId("");
      setAddingExtraQty("1");
    }
  }, [product, open]);

  // Ejes disponibles, derivados de las variantes del producto (ver
  // parseVariantName en lib/catalog.ts). Un producto que solo usa
  // "Chico"/"Grande" (sin convención de temperatura) se comporta idéntico
  // a antes de este cambio: un solo selector de tamaño.
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

  const variant: CatalogVariant | null = useMemo(() => {
    if (!product) return null;
    if (sizes.length === 0 && temperatures.length === 0) {
      return product.variants[0] ?? null;
    }
    return (
      product.variants.find(
        (v) =>
          (sizes.length === 0 || v.sizeLabel === sizeLabel) &&
          (temperatures.length === 0 || v.temperature === temperature)
      ) ?? null
    );
  }, [product, sizes.length, sizeLabel, temperatures.length, temperature]);

  const missingRequired = useMemo(() => {
    if (!variant) return [];
    return variant.modifierGroups.filter(
      (g) => g.isRequired && (selected[g.id]?.size ?? 0) === 0
    );
  }, [variant, selected]);

  if (!product) return null;

  function toggleOption(groupId: string, option: CatalogModifierOption, allowMultiple: boolean) {
    setSelected((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (allowMultiple) {
        if (current.has(option.id)) current.delete(option.id);
        else current.add(option.id);
      } else {
        current.clear();
        if (!prev[groupId]?.has(option.id)) current.add(option.id);
      }
      return { ...prev, [groupId]: current };
    });
  }

  function handleAddExtra() {
    const option = extraIngredientOptions.find((i) => i.id === addingExtraId);
    const quantity = Number(addingExtraQty) || 0;
    if (!option || quantity <= 0) return;
    setExtras((prev) => [
      ...prev,
      {
        ingredientId: option.id,
        name: option.name,
        quantity,
        unit: option.baseUnit,
        priceDelta: quantity * option.unitCost,
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
    <Dialog open={open} onOpenChange={onOpenChange} title={product.name}>
      <div className="flex flex-col gap-4">
        {sizes.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Tamaño</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSizeLabel(size)}
                  className={cn(
                    "rounded-md border border-border px-3 py-1.5 text-sm",
                    sizeLabel === size
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {temperatures.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Temperatura</p>
            <div className="flex flex-wrap gap-2">
              {temperatures.map((temp) => (
                <button
                  key={temp}
                  type="button"
                  onClick={() => setTemperature(temp)}
                  className={cn(
                    "rounded-md border border-border px-3 py-1.5 text-sm",
                    temperature === temp
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {temperatureLabels[temp]}
                </button>
              ))}
            </div>
          </div>
        )}

        {!variant && (sizes.length > 0 || temperatures.length > 0) && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Esta combinación no está disponible.
          </p>
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
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleOption(group.id, option, group.allowMultiple)}
                    className={cn(
                      "rounded-md border border-border px-3 py-1.5 text-sm",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    {option.name}
                    {option.priceDelta !== 0 && ` (+${formatCurrency(option.priceDelta)})`}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-2 text-sm font-medium">Agregar otro ingrediente</p>
          <div className="flex items-end gap-2">
            <Select
              className="flex-1"
              value={addingExtraId}
              onChange={(e) => setAddingExtraId(e.target.value)}
            >
              <option value="">Selecciona un ingrediente…</option>
              {extraIngredientOptions.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="w-20"
              value={addingExtraQty}
              onChange={(e) => setAddingExtraQty(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={handleAddExtra} disabled={!addingExtraId}>
              Agregar
            </Button>
          </div>

          {extras.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {extras.map((extra, index) => (
                <li key={`${extra.ingredientId}-${index}`} className="flex items-center justify-between text-sm">
                  <span>
                    {extra.name} · {extra.quantity} {extra.unit}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>+{formatCurrency(extra.priceDelta)}</span>
                    <button
                      type="button"
                      onClick={() => removeExtra(index)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="item-notes">Notas (opcional)</Label>
          <textarea
            id="item-notes"
            className="min-h-[60px] rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="ej. sin azúcar, bien caliente"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm font-medium">Total</span>
          <span className="text-lg font-semibold">{formatCurrency(total)}</span>
        </div>

        <Button onClick={handleAdd} disabled={!variant || missingRequired.length > 0}>
          Agregar al carrito
        </Button>
      </div>
    </Dialog>
  );
}
