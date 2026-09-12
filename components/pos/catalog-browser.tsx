"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn, posAccentClass } from "@/lib/utils";
import type { CatalogCategory, CatalogProduct, CatalogVariant } from "@/lib/catalog";
import { Input } from "@/components/ui/input";
import { ProductCard } from "./product-card";

export function CatalogBrowser({
  catalog,
  onQuickAdd,
  onCustomize,
}: {
  catalog: CatalogCategory[];
  onQuickAdd: (product: CatalogProduct, variant: CatalogVariant, quantity: number) => void;
  onCustomize: (product: CatalogProduct) => void;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(catalog[0]?.id);
  const [query, setQuery] = useState("");
  const activeCategory = catalog.find((c) => c.id === activeCategoryId) ?? catalog[0];

  const filteredProducts = useMemo(() => {
    const products = activeCategory?.products ?? [];
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return products;
    return products.filter((p) => p.name.toLowerCase().includes(trimmed));
  }, [activeCategory, query]);

  if (catalog.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No hay productos activos y habilitados para esta sucursal todavía.
      </p>
    );
  }

  return (
    <div className="flex h-full">
      <nav className="flex w-44 flex-shrink-0 flex-col gap-1.5 overflow-y-auto p-3">
        {catalog.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategoryId(category.id)}
            className={cn(
              "rounded-full px-4 py-2 text-left text-sm font-medium transition-colors",
              category.id === activeCategory?.id
                ? posAccentClass
                : "text-foreground hover:bg-muted"
            )}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="relative max-w-sm flex-shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto…"
            className="rounded-full pl-9"
          />
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto pr-1">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onQuickAdd={onQuickAdd}
              onCustomize={onCustomize}
            />
          ))}
          {filteredProducts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin resultados para “{query}” en {activeCategory?.name}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
