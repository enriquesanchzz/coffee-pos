"use client";

import { Coffee } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { RecipeOverviewProduct } from "@/lib/recipes";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Tarjeta de producto para /productos — mismo lenguaje visual que
// components/pos/product-card.tsx, pero abre el producto en el workspace
// (menú de variantes a la izquierda) en vez de un diálogo, y marca
// productos inactivos.
export function ProductCard({
  product,
  onSelect,
}: {
  product: RecipeOverviewProduct;
  onSelect: (product: RecipeOverviewProduct) => void;
}) {
  const activePrices = product.variants.filter((v) => v.isActive).map((v) => v.price);
  const fromPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0;

  return (
    <Card
      className="flex aspect-square cursor-pointer flex-col overflow-hidden rounded-2xl p-0 transition-shadow hover:shadow-md"
      onClick={() => onSelect(product)}
    >
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <Coffee className="h-10 w-10 text-muted-foreground" />
        )}
        {!product.isActive && (
          <Badge variant="outline" className="absolute right-2 top-2 bg-background text-[10px]">
            inactivo
          </Badge>
        )}
      </div>
      <div className="p-3">
        <p className="text-base font-semibold leading-tight">{product.name}</p>
        <p className="text-sm text-muted-foreground">
          {activePrices.length > 1 ? "Desde " : ""}
          {activePrices.length > 0 ? formatCurrency(fromPrice) : "Sin variantes activas"}
        </p>
      </div>
    </Card>
  );
}
