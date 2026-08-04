"use client";

import { useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import type { CatalogCategory, CatalogProduct } from "@/lib/catalog";
import { Card } from "@/components/ui/card";

export function CatalogBrowser({
  catalog,
  onSelectProduct,
}: {
  catalog: CatalogCategory[];
  onSelectProduct: (product: CatalogProduct) => void;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(catalog[0]?.id);
  const activeCategory = catalog.find((c) => c.id === activeCategoryId) ?? catalog[0];

  if (catalog.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No hay productos activos y habilitados para esta sucursal todavía.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 overflow-x-auto border-b border-border p-3">
        {catalog.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategoryId(category.id)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm",
              category.id === activeCategory?.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-muted/70"
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
        {activeCategory?.products.map((product) => {
          const fromPrice = Math.min(...product.variants.map((v) => v.price));
          return (
            <Card
              key={product.id}
              className="cursor-pointer p-4 transition-shadow hover:shadow-md"
              onClick={() => onSelectProduct(product)}
            >
              <p className="font-medium">{product.name}</p>
              <p className="text-sm text-muted-foreground">
                Desde {formatCurrency(fromPrice)}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
