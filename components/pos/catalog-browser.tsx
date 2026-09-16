"use client";

import { useState } from "react";
import type { CatalogCategory, CatalogProduct } from "@/lib/catalog";
import { CategoryDrilldown, type DrilldownCategory } from "@/components/catalog/category-drilldown";
import { ProductCard } from "./product-card";

function productGrid(products: CatalogProduct[], onSelectProduct: (p: CatalogProduct) => void, emptyText: string) {
  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="grid auto-rows-min grid-cols-2 gap-4 pr-1 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />
      ))}
    </div>
  );
}

export function CatalogBrowser({
  catalog,
  onSelectProduct,
}: {
  catalog: CatalogCategory[];
  onSelectProduct: (product: CatalogProduct) => void;
}) {
  const [query, setQuery] = useState("");

  if (catalog.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No hay productos activos y habilitados para esta sucursal todavía.
      </p>
    );
  }

  const drilldownCategories: DrilldownCategory[] = catalog.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    parentId: c.parentId,
    parentName: c.parentName,
  }));

  return (
    <CategoryDrilldown
      categories={drilldownCategories}
      query={query}
      onQueryChange={setQuery}
      renderLeaf={(categoryId) => {
        const category = catalog.find((c) => c.id === categoryId);
        return productGrid(category?.products ?? [], onSelectProduct, "Sin productos en esta categoría.");
      }}
      renderSearchResults={(q) => {
        const lower = q.toLowerCase();
        const results = catalog.flatMap((c) => c.products).filter((p) => p.name.toLowerCase().includes(lower));
        return productGrid(results, onSelectProduct, `Sin resultados para "${q}".`);
      }}
    />
  );
}
