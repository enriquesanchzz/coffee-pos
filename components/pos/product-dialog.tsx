"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import type { CatalogModifierOption, CatalogProduct, CatalogVariant } from "@/lib/catalog";
import type { CartModifier } from "./cart-store";

export function ProductDialog({
  product,
  open,
  onOpenChange,
  onAdd,
}: {
  product: CatalogProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: {
    productVariantId: string;
    productName: string;
    variantName: string;
    unitBasePrice: number;
    modifiers: CartModifier[];
  }) => void;
}) {
  const [variant, setVariant] = useState<CatalogVariant | null>(null);
  // Por groupId: set de modifierOptionId seleccionados.
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (product && open) {
      setVariant(product.variants[0] ?? null);
      setSelected({});
    }
  }, [product, open]);

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

  const selectedOptions: CatalogModifierOption[] = variant
    ? variant.modifierGroups.flatMap((g) =>
        g.options.filter((o) => selected[g.id]?.has(o.id))
      )
    : [];

  const total =
    (variant?.price ?? 0) + selectedOptions.reduce((sum, o) => sum + o.priceDelta, 0);

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
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={product.name}>
      <div className="flex flex-col gap-4">
        {product.variants.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Tamaño</p>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariant(v)}
                  className={cn(
                    "rounded-md border border-border px-3 py-1.5 text-sm",
                    variant?.id === v.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {v.name} · {formatCurrency(v.price)}
                </button>
              ))}
            </div>
          </div>
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
