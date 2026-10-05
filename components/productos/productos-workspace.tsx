"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  RecipeOverviewProduct,
  ProductCategoryOption,
  IngredientOption,
  ComposedRecipeOption,
  VariantRecipeDetail,
  ProductBasicInfo,
  IngredientCategoryOption,
} from "@/lib/recipes";
import { ChevronLeft } from "lucide-react";
import { CategoryDrilldown, type DrilldownCategory } from "@/components/catalog/category-drilldown";
import { ProductCard } from "./product-card";
import { VariantCard, AddVariantCard } from "./variant-card";
import { NewProductForm } from "./new-product-form";
import { AddVariantForm } from "./add-variant-form";
import { EditRecipeForm } from "./edit-recipe-form";
import { CategoryIconPicker } from "./category-icon-picker";
import { fetchVariantRecipeDetail as fetchVariantRecipeDetailAction, updateProductCategory as updateProductCategoryAction } from "@/actions/recipes";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { withActionErrors } from "@/lib/action-result";
import { matchesSearch } from "@/lib/search";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const fetchVariantRecipeDetail = withActionErrors(fetchVariantRecipeDetailAction);
const updateProductCategory = withActionErrors(updateProductCategoryAction);

type MainView = "browse" | "product-variants" | "new-product" | "add-variant" | "edit-variant";

// Vista única de /productos (mismo espíritu que PosWorkspace): categorías
// a la izquierda; al abrir un producto, la izquierda cambia a sus
// variantes; crear/editar producto o variante pasa a ser un panel de
// esta misma vista, sin navegar a otra URL — ver Parte B del plan
// "Productos + POS 2".
export function ProductosWorkspace({
  products,
  categories,
  ingredientOptions,
  targetFoodCostPercent,
  employeeId,
}: {
  products: RecipeOverviewProduct[];
  categories: ProductCategoryOption[];
  ingredientOptions: {
    ingredients: IngredientOption[];
    composedRecipes: ComposedRecipeOption[];
    categories: IngredientCategoryOption[];
  };
  targetFoodCostPercent: number;
  employeeId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>("browse");
  const [, setEditingVariantId] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState<VariantRecipeDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [ingredients] = useState(ingredientOptions.ingredients);
  const [editingCategory, setEditingCategory] = useState<DrilldownCategory | null>(null);
  const [, startTransition] = useTransition();

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  // Los productos inactivos (ej. el catálogo de demo reemplazado por el
  // menú real) se ocultan por default para no ensuciar la navegación
  // (QA-027); se pueden mostrar para reactivarlos.
  const [showInactive, setShowInactive] = useState(false);
  const visibleProducts = showInactive ? products : products.filter((p) => p.isActive);

  const drilldownCategories: DrilldownCategory[] = categories
    .filter((c) => visibleProducts.some((p) => p.categoryId === c.id))
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, parentId: c.parentId, parentName: c.parentName }));

  function backToBrowse() {
    setSelectedProductId(null);
    setMainView("browse");
    setEditingDetail(null);
    setEditingVariantId(null);
  }

  function openProduct(product: RecipeOverviewProduct) {
    setSelectedProductId(product.id);
    setMainView("product-variants");
    setEditingDetail(null);
    setEditingVariantId(null);
  }

  function backToVariants() {
    setMainView("product-variants");
    setEditingDetail(null);
    setEditingVariantId(null);
  }

  function openVariant(variantId: string) {
    setEditingVariantId(variantId);
    setMainView("edit-variant");
    setDetailError(null);
    setIsLoadingDetail(true);
    startTransition(async () => {
      try {
        const detail = await fetchVariantRecipeDetail(variantId);
        setEditingDetail(detail);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : "No se pudo cargar la variante.");
      } finally {
        setIsLoadingDetail(false);
      }
    });
  }

  function handleSaved(afterProductId?: string) {
    router.refresh();
    if (afterProductId) setSelectedProductId(afterProductId);
    setMainView("product-variants");
    setEditingDetail(null);
    setEditingVariantId(null);
  }

  function productGrid(list: RecipeOverviewProduct[], emptyText: string) {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground">{emptyText}</p>;
    }
    return (
      <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 pr-1 sm:gap-4">
        {list.map((product) => (
          <ProductCard key={product.id} product={product} onSelect={openProduct} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold">Productos</h1>
          <p className="text-sm text-muted-foreground">Bebidas con receta, merch, souvenirs y tarjetas de regalo.</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar inactivos
          </label>
          <Button
            onClick={() => {
              setSelectedProductId(null);
              setMainView("new-product");
            }}
          >
            + Nuevo producto
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {mainView === "browse" && (
          <CategoryDrilldown
            categories={drilldownCategories}
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Buscar producto…"
            onEditCategory={setEditingCategory}
            renderLeaf={(categoryId) =>
              productGrid(
                visibleProducts.filter((p) => p.categoryId === categoryId),
                "Sin productos en esta categoría."
              )
            }
            renderSearchResults={(q) =>
              productGrid(
                visibleProducts.filter((p) => matchesSearch(q, p.name)),
                `Sin resultados para "${q}".`
              )
            }
          />
        )}

        {mainView === "new-product" && (
          <div className="h-full overflow-y-auto">
            <NewProductForm
              categories={categories}
              ingredientOptions={{
                ingredients,
                composedRecipes: ingredientOptions.composedRecipes,
                categories: ingredientOptions.categories,
              }}
              employeeId={employeeId}
              targetFoodCostPercent={targetFoodCostPercent}
              onSaved={handleSaved}
            />
          </div>
        )}

        {selectedProduct && mainView === "product-variants" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <div>
                <button
                  type="button"
                  onClick={backToBrowse}
                  className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Categorías
                </button>
                <h2 className="mt-2 text-lg font-semibold">{selectedProduct.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedProduct.categoryName}</p>
              </div>

              <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 sm:gap-4">
                {selectedProduct.variants.map((variant) => (
                  <VariantCard key={variant.id} variant={variant} onSelect={openVariant} />
                ))}
                <AddVariantCard
                  onClick={() => {
                    setMainView("add-variant");
                    setEditingDetail(null);
                    setEditingVariantId(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {selectedProduct && (mainView === "add-variant" || mainView === "edit-variant") && (
          <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto flex max-w-xl flex-col gap-4">
              <button
                type="button"
                onClick={backToVariants}
                className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                {selectedProduct.name}
              </button>

              {mainView === "add-variant" && (
                <AddVariantForm
                  product={
                    {
                      id: selectedProduct.id,
                      name: selectedProduct.name,
                      type: selectedProduct.type,
                      categoryName: selectedProduct.categoryName,
                    } satisfies ProductBasicInfo
                  }
                  ingredientOptions={{
                    ingredients,
                    composedRecipes: ingredientOptions.composedRecipes,
                    categories: ingredientOptions.categories,
                  }}
                  employeeId={employeeId}
                  targetFoodCostPercent={targetFoodCostPercent}
                  onSaved={() => handleSaved()}
                />
              )}

              {mainView === "edit-variant" && (
                <>
                  {isLoadingDetail && <p className="text-sm text-muted-foreground">Cargando…</p>}
                  {detailError && <p className="text-sm text-destructive">{detailError}</p>}
                  {editingDetail && !isLoadingDetail && (
                    <EditRecipeForm
                      detail={editingDetail}
                      ingredientOptions={{
                        ingredients,
                        composedRecipes: ingredientOptions.composedRecipes,
                        categories: ingredientOptions.categories,
                      }}
                      employeeId={employeeId}
                      targetFoodCostPercent={targetFoodCostPercent}
                      onSaved={() => handleSaved()}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {editingCategory && (
        <EditCategoryDialog
          category={editingCategory}
          categories={categories}
          employeeId={employeeId}
          onClose={() => setEditingCategory(null)}
          onSaved={() => {
            setEditingCategory(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditCategoryDialog({
  category,
  categories,
  employeeId,
  onClose,
  onSaved,
}: {
  category: DrilldownCategory;
  categories: ProductCategoryOption[];
  employeeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState<string | null>(category.icon);
  const [parentId, setParentId] = useState(category.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parentOptions = categories.filter((c) => c.id !== category.id && !c.parentId);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateProductCategory({
          employeeId,
          categoryId: category.id,
          name,
          icon: icon || undefined,
          parentId: parentId || undefined,
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la categoría.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose} title="Editar categoría">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit-category-name">Nombre</Label>
          <Input id="edit-category-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <CategoryIconPicker value={icon} onChange={setIcon} />
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit-category-parent">Categoría padre (opcional)</Label>
          <Select id="edit-category-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Sin categoría padre</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
