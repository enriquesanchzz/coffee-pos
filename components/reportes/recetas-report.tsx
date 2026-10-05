import type { RecipeCostReportItem } from "@/lib/reports";
import type { ProductCategoryOption } from "@/lib/recipes";
import { RecipeReportFilters } from "./recipe-report-filters";
import { RecetasTable } from "./recetas-table";

export function RecetasReport({
  items,
  categories,
  categoryId,
  temperature,
}: {
  items: RecipeCostReportItem[];
  categories: ProductCategoryOption[];
  categoryId: string;
  temperature: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Costo de recetas</h2>
          <p className="text-sm text-muted-foreground">
            Costo actual calculado con el costo cotizado de cada ingrediente en Compras.
          </p>
        </div>
        <RecipeReportFilters categories={categories} categoryId={categoryId} temperature={temperature} view="recetas" />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay recetas activas con estos filtros.</p>
      ) : (
        <RecetasTable items={items} />
      )}
    </div>
  );
}
