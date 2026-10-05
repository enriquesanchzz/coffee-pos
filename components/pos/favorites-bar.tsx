"use client";

import type { CatalogProduct } from "@/lib/catalog";
import { formatCurrency } from "@/lib/utils";

// Más vendidos de la sucursal (últimos 30 días).
export function FavoritesBar({
  products,
  onSelectProduct,
}: {
  products: CatalogProduct[];
  onSelectProduct: (product: CatalogProduct) => void;
}) {
  if (products.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3">
      {products.map((product) => {
        const prices = product.variants.map((v) => v.price);
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        return (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelectProduct(product)}
            className="flex min-w-[120px] flex-shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-left hover:bg-muted"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{product.name}</span>
              <span className="block text-xs text-muted-foreground">{formatCurrency(minPrice)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
