"use client";

import { ChevronLeft, Plus } from "lucide-react";
import type { RecipeOverviewProduct } from "@/lib/recipes";
import { formatCurrency, cn } from "@/lib/utils";
import { temperatureLabels } from "./enum-labels";

// Panel izquierdo cuando hay un producto abierto en /productos — sus
// variantes como botones (punto 2, "cambios para la sección productos"),
// reemplaza la barra de categorías mientras el producto está abierto.
export function VariantNav({
  product,
  activeVariantId,
  onBack,
  onSelectVariant,
  onAddVariant,
}: {
  product: RecipeOverviewProduct;
  activeVariantId: string | null;
  onBack: () => void;
  onSelectVariant: (variantId: string) => void;
  onAddVariant: () => void;
}) {
  return (
    <nav className="flex w-48 flex-shrink-0 flex-col gap-1 overflow-y-auto p-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Categorías
      </button>
      <p className="truncate px-3 text-sm font-semibold">{product.name}</p>
      <p className="truncate px-3 pb-2 text-xs text-muted-foreground">{product.categoryName}</p>

      {product.variants.map((variant) => (
        <button
          key={variant.id}
          type="button"
          onClick={() => onSelectVariant(variant.id)}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm",
            variant.id === activeVariantId ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          <span className="flex items-center gap-1 truncate">
            {variant.name}
            {variant.temperature && ` · ${temperatureLabels[variant.temperature]}`}
            {!variant.isActive && " (inactiva)"}
          </span>
          <span className="text-xs opacity-80">{formatCurrency(variant.price)}</span>
        </button>
      ))}

      <button
        type="button"
        onClick={onAddVariant}
        className="mt-2 flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-4 w-4" />
        Agregar variante
      </button>
    </nav>
  );
}
