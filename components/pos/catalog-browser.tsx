"use client";

import { useState } from "react";
import { Coffee } from "lucide-react";
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
    <div className="flex h-full">
      <nav className="flex w-44 flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3">
        {catalog.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategoryId(category.id)}
            className={cn(
              "rounded-md px-3 py-2 text-left text-sm",
              category.id === activeCategory?.id
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted"
            )}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
        {activeCategory?.products.map((product) => {
          const fromPrice = Math.min(...product.variants.map((v) => v.price));
          return (
            <Card
              key={product.id}
              className="flex aspect-square cursor-pointer flex-col overflow-hidden p-0 transition-shadow hover:shadow-md"
              onClick={() => onSelectProduct(product)}
            >
              <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted">
                {product.imageUrl ? (
                  // Imagen por URL externa — no hay storage de archivos
                  // configurado, ver docs/CONTINUE.md.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Coffee className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="p-3">
                <p className="text-base font-semibold leading-tight">{product.name}</p>
                <p className="text-sm text-muted-foreground">Desde {formatCurrency(fromPrice)}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
