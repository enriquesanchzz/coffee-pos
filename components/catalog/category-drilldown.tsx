"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Pencil, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CategoryIcon } from "@/components/productos/category-icon-picker";

export type DrilldownCategory = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  parentName: string | null;
};

type TopEntry =
  | { kind: "standalone"; category: DrilldownCategory }
  | { kind: "parent"; id: string; name: string; icon: string | null; children: DrilldownCategory[] };

// Agrupa en árbol de 2 niveles — misma idea que buildNavEntries de
// components/pos/catalog-browser.tsx (ahora compartida entre POS y
// Productos, ver Parte A del plan "Productos + POS 2"). Solo se le pasan
// categorías que ya tienen al menos un item — filtrar categorías vacías
// es responsabilidad del caller (mismo criterio que getCatalog() hoy).
function buildTopEntries(categories: DrilldownCategory[]): TopEntry[] {
  const standalones: TopEntry[] = [];
  const parents = new Map<string, { kind: "parent"; id: string; name: string; icon: string | null; children: DrilldownCategory[] }>();

  for (const category of categories) {
    if (!category.parentId) {
      standalones.push({ kind: "standalone", category });
      continue;
    }
    let group = parents.get(category.parentId);
    if (!group) {
      // El ícono del nivel 1 sale de la categoría padre misma si está en
      // la lista (categoría sin producto propio, solo agrupadora) — si
      // no, se toma prestado del primer hijo para no dejar el nivel 1
      // sin ícono.
      const parentSelf = categories.find((c) => c.id === category.parentId);
      group = {
        kind: "parent",
        id: category.parentId,
        name: category.parentName ?? category.name,
        icon: parentSelf?.icon ?? null,
        children: [],
      };
      parents.set(category.parentId, group);
    }
    group.children.push(category);
  }

  const entries: TopEntry[] = [...standalones, ...Array.from(parents.values())];
  entries.sort((a, b) => {
    const nameA = a.kind === "standalone" ? a.category.name : a.name;
    const nameB = b.kind === "standalone" ? b.category.name : b.name;
    return nameA.localeCompare(nameB, "es");
  });
  return entries;
}

// Navegación compartida por POS (/pos) y Productos (/productos):
// categorías de nivel 1 como píldoras con ícono en una barra angosta a
// la izquierda; al elegir una con subcategorías, el área principal
// muestra las subcategorías como tarjetas; al elegir una subcategoría (o
// una categoría sin hijas), el área principal muestra el contenido final
// (`renderLeaf`). Con texto en el buscador, se ignora el nivel actual
// (`renderSearchResults`) — mismo comportamiento que ya existía.
export function CategoryDrilldown({
  categories,
  query,
  onQueryChange,
  searchPlaceholder = "Buscar en todo el menú…",
  renderLeaf,
  renderSearchResults,
  onEditCategory,
}: {
  categories: DrilldownCategory[];
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;
  renderLeaf: (categoryId: string) => React.ReactNode;
  renderSearchResults: (query: string) => React.ReactNode;
  /** Si se da, cada píldora de nivel 1 gana un botón de editar (solo /productos). */
  onEditCategory?: (category: DrilldownCategory) => void;
}) {
  const topEntries = useMemo(() => buildTopEntries(categories), [categories]);

  const [activeTopId, setActiveTopId] = useState(() => {
    const first = topEntries[0];
    if (!first) return null;
    return first.kind === "standalone" ? first.category.id : first.id;
  });
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  const activeTop = topEntries.find((e) => (e.kind === "standalone" ? e.category.id : e.id) === activeTopId) ?? null;

  function selectTop(id: string) {
    setActiveTopId(id);
    setActiveSubId(null);
  }

  const trimmedQuery = query.trim();

  return (
    <div className="flex h-full">
      <nav className="flex w-48 flex-shrink-0 flex-col gap-1 overflow-y-auto p-3">
        {topEntries.map((entry) => {
          const id = entry.kind === "standalone" ? entry.category.id : entry.id;
          const name = entry.kind === "standalone" ? entry.category.name : entry.name;
          const icon = entry.kind === "standalone" ? entry.category.icon : entry.icon;
          const isActive = id === activeTopId && !trimmedQuery;
          return (
            <div key={id} className="group flex items-center gap-1">
              <button
                onClick={() => selectTop(id)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                )}
              >
                <CategoryIcon icon={icon} className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{name}</span>
              </button>
              {onEditCategory && entry.kind === "standalone" && (
                <button
                  type="button"
                  onClick={() => onEditCategory(entry.category)}
                  className="hidden h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted group-hover:flex"
                  title="Editar categoría"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="relative max-w-sm flex-shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="rounded-full pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {trimmedQuery ? (
            renderSearchResults(trimmedQuery)
          ) : !activeTop ? (
            <p className="text-sm text-muted-foreground">No hay categorías todavía.</p>
          ) : activeTop.kind === "parent" && activeSubId === null ? (
            <div className="grid auto-rows-min grid-cols-2 gap-4 pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {activeTop.children.map((child) => (
                <Card
                  key={child.id}
                  className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center transition-shadow hover:shadow-md"
                  onClick={() => setActiveSubId(child.id)}
                >
                  <CategoryIcon icon={child.icon} className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium leading-tight">{child.name}</p>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col gap-3">
              {activeTop.kind === "parent" && (
                <button
                  type="button"
                  onClick={() => setActiveSubId(null)}
                  className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Subcategorías
                </button>
              )}
              <div className="flex-1 overflow-y-auto">
                {renderLeaf(activeTop.kind === "parent" ? activeSubId! : activeTop.category.id)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
