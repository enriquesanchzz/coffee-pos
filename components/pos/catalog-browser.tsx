"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn, posAccentClass } from "@/lib/utils";
import type { CatalogCategory, CatalogProduct } from "@/lib/catalog";
import { Input } from "@/components/ui/input";
import { ProductCard } from "./product-card";

// Nav de 2 niveles: categorías con parentId se agrupan bajo su padre
// (expandible); las que no tienen padre (ej. "Café en grano") se
// muestran directo, como antes. getCatalog() ya manda parentId/parentName
// denormalizado por categoría (lib/catalog.ts).
type NavEntry =
  | { kind: "standalone"; category: CatalogCategory }
  | { kind: "parent"; id: string; name: string; children: CatalogCategory[] };

function buildNavEntries(catalog: CatalogCategory[]): NavEntry[] {
  const standalones: NavEntry[] = [];
  const parents = new Map<string, { kind: "parent"; id: string; name: string; children: CatalogCategory[] }>();

  for (const category of catalog) {
    if (!category.parentId) {
      standalones.push({ kind: "standalone", category });
      continue;
    }
    let group = parents.get(category.parentId);
    if (!group) {
      group = { kind: "parent", id: category.parentId, name: category.parentName ?? category.name, children: [] };
      parents.set(category.parentId, group);
    }
    group.children.push(category);
  }

  const entries: NavEntry[] = [...standalones, ...Array.from(parents.values())];
  entries.sort((a, b) => {
    const nameA = a.kind === "standalone" ? a.category.name : a.name;
    const nameB = b.kind === "standalone" ? b.category.name : b.name;
    return nameA.localeCompare(nameB, "es");
  });
  return entries;
}

export function CatalogBrowser({
  catalog,
  onSelectProduct,
}: {
  catalog: CatalogCategory[];
  onSelectProduct: (product: CatalogProduct) => void;
}) {
  const navEntries = useMemo(() => buildNavEntries(catalog), [catalog]);

  const firstLeafId = useMemo(() => {
    const first = navEntries[0];
    if (!first) return undefined;
    return first.kind === "standalone" ? first.category.id : first.children[0]?.id;
  }, [navEntries]);

  const [activeCategoryId, setActiveCategoryId] = useState(firstLeafId);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(() => {
    const first = navEntries[0];
    return first?.kind === "parent" ? new Set([first.id]) : new Set();
  });
  const [query, setQuery] = useState("");

  const activeCategory = catalog.find((c) => c.id === activeCategoryId) ?? catalog[0];

  function toggleExpanded(parentId: string) {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  // Punto 3 (Mejoras avanzadas de POS): con texto en el buscador, se
  // ignora la categoría activa y se busca en todo el catálogo — sin
  // texto, vuelve al filtrado por categoría/subcategoría de siempre.
  const trimmedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (trimmedQuery) {
      return catalog
        .flatMap((c) => c.products)
        .filter((p) => p.name.toLowerCase().includes(trimmedQuery));
    }
    return activeCategory?.products ?? [];
  }, [catalog, activeCategory, trimmedQuery]);

  if (catalog.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No hay productos activos y habilitados para esta sucursal todavía.
      </p>
    );
  }

  return (
    <div className="flex h-full">
      <nav className="flex w-52 flex-shrink-0 flex-col gap-1 overflow-y-auto p-3">
        {navEntries.map((entry) =>
          entry.kind === "standalone" ? (
            <button
              key={entry.category.id}
              onClick={() => setActiveCategoryId(entry.category.id)}
              className={cn(
                "rounded-full px-4 py-2 text-left text-sm font-medium transition-colors",
                entry.category.id === activeCategory?.id
                  ? posAccentClass
                  : "text-foreground hover:bg-muted"
              )}
            >
              {entry.category.name}
            </button>
          ) : (
            <div key={entry.id}>
              <button
                onClick={() => toggleExpanded(entry.id)}
                className="flex w-full items-center gap-1 rounded-full px-4 py-2 text-left text-sm font-medium text-foreground hover:bg-muted"
              >
                {expandedParents.has(entry.id) ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                {entry.name}
              </button>
              {expandedParents.has(entry.id) && (
                <div className="ml-3 flex flex-col gap-1 border-l border-border pl-2">
                  {entry.children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setActiveCategoryId(child.id)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-left text-sm transition-colors",
                        child.id === activeCategory?.id
                          ? posAccentClass
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </nav>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="relative max-w-sm flex-shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en todo el menú…"
            className="rounded-full pl-9"
          />
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />
          ))}
          {filteredProducts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {trimmedQuery ? `Sin resultados para "${query}".` : "Sin productos en esta categoría."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
