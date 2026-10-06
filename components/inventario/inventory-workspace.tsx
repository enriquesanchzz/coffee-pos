"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InventoryOverviewItem, IngredientCategoryOption } from "@/lib/inventory";
import { CategoryDrilldown, type DrilldownCategory } from "@/components/catalog/category-drilldown";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { IngredientFormDialog } from "./ingredient-form-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { unitLabels } from "./unit-labels";
import { matchesSearch } from "@/lib/search";

// Mismo flujo de navegación que /pos y /productos (CategoryDrilldown
// compartido) — categorías de insumo como píldoras a la izquierda,
// insumos como tarjetas en el área principal, en vez del acordeón por
// categoría que había antes. Las categorías de insumo son planas (sin
// subcategoría), así que cada una es una entrada "standalone" para
// CategoryDrilldown — misma pieza que ya usan Productos/POS, sin
// modificarla.
export function InventoryWorkspace({
  items,
  categories,
  employeeId,
}: {
  items: InventoryOverviewItem[];
  categories: IngredientCategoryOption[];
  employeeId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [adjusting, setAdjusting] = useState<InventoryOverviewItem | null>(null);
  const [editingIngredient, setEditingIngredient] = useState<InventoryOverviewItem | null>(null);
  const [creatingIngredientFor, setCreatingIngredientFor] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<IngredientCategoryOption | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);

  const drilldownCategories: DrilldownCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    parentId: null,
    parentName: null,
  }));

  function refresh() {
    router.refresh();
  }

  function renderIngredientCard(item: InventoryOverviewItem) {
    return (
      <Card key={item.id} className="flex flex-col gap-2 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-medium leading-tight">{item.name}</p>
          {item.isLow && (
            <Badge variant="destructive" className="flex-shrink-0 text-[10px]">
              {item.quantity < 0 ? "negativo" : item.quantity === 0 ? "sin stock" : "stock bajo"}
            </Badge>
          )}
        </div>
        <p className={item.quantity < 0 ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
          {new Intl.NumberFormat("es-MX").format(item.quantity)} {unitLabels[item.baseUnit] ?? item.baseUnit}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => setAdjusting(item)}>
            Ajustar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditingIngredient(item)}>
            Editar
          </Button>
        </div>
      </Card>
    );
  }

  function renderLeaf(categoryId: string) {
    const categoryItems = items.filter((item) => item.categoryId === categoryId);
    return (
      <div className="flex flex-col gap-3">
        <Button size="sm" className="w-fit" onClick={() => setCreatingIngredientFor(categoryId)}>
          + Nuevo insumo
        </Button>
        {categoryItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin insumos en esta categoría.</p>
        ) : (
          <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3 pr-1 sm:gap-4">
            {categoryItems.map(renderIngredientCard)}
          </div>
        )}
      </div>
    );
  }

  function renderSearchResults(trimmedQuery: string) {
    const q = trimmedQuery.toLowerCase();
    const matches = items.filter((item) => matchesSearch(q, item.name, item.categoryName));
    if (matches.length === 0) {
      return <p className="text-sm text-muted-foreground">Sin resultados para &quot;{trimmedQuery}&quot;.</p>;
    }
    return (
      <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3 pr-1 sm:gap-4">
        {matches.map(renderIngredientCard)}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold">Inventario</h1>
          <p className="text-sm text-muted-foreground">Insumos, categorías y stock.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreatingCategory(true)}>
          + Nueva categoría
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        {categories.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Todavía no hay categorías de insumo — crea una para empezar.
          </p>
        ) : (
          <CategoryDrilldown
            // CategoryDrilldown fija su categoría activa en el primer
            // render (useState inicial) y nunca la reconcilia si esa
            // categoría desaparece — irrelevante en POS/Productos (esas
            // categorías no se borran en vivo), pero en Inventario sí se
            // puede borrar la categoría que se está viendo. Un `key` atado
            // al set de ids fuerza un remount (y un activeTopId fresco)
            // cada vez que la lista de categorías cambia, sin tocar el
            // componente compartido.
            key={categories.map((c) => c.id).join(",")}
            categories={drilldownCategories}
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Buscar insumo…"
            renderLeaf={renderLeaf}
            renderSearchResults={renderSearchResults}
            onEditCategory={(c) => setEditingCategory(categories.find((cat) => cat.id === c.id) ?? null)}
          />
        )}
      </div>

      <AdjustStockDialog
        item={adjusting}
        employeeId={employeeId}
        onOpenChange={(open) => !open && setAdjusting(null)}
      />

      <IngredientFormDialog
        open={editingIngredient !== null}
        ingredient={editingIngredient}
        categories={categories}
        employeeId={employeeId}
        onOpenChange={(open) => !open && setEditingIngredient(null)}
        onSaved={refresh}
      />

      <IngredientFormDialog
        open={creatingIngredientFor !== null}
        ingredient={null}
        categories={categories}
        defaultCategoryId={creatingIngredientFor ?? undefined}
        employeeId={employeeId}
        onOpenChange={(open) => !open && setCreatingIngredientFor(null)}
        onSaved={refresh}
      />

      <CategoryFormDialog
        open={editingCategory !== null}
        category={editingCategory}
        employeeId={employeeId}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        onSaved={refresh}
      />

      <CategoryFormDialog
        open={creatingCategory}
        category={null}
        employeeId={employeeId}
        onOpenChange={setCreatingCategory}
        onSaved={refresh}
      />
    </div>
  );
}
