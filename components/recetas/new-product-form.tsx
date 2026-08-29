"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductCategoryOption, IngredientOption, ComposedRecipeOption } from "@/lib/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createProductWithRecipe, type RecipeLineInput } from "@/actions/recipes";
import { RecipeLinesEditor, emptyLine, initialLine, type LineDraft } from "./recipe-lines-editor";

type VariantDraft = {
  key: string;
  name: string;
  price: string;
  lines: LineDraft[];
};

// Usada por "+ Agregar variante" (solo en el cliente, después de montar) —
// crypto.randomUUID() aquí es seguro porque nunca corre durante SSR.
function emptyVariant(): VariantDraft {
  return { key: crypto.randomUUID(), name: "", price: "0", lines: [emptyLine()] };
}

// Estado inicial del formulario (useState corre en SSR y al hidratar) — key
// fijo para no romper la hidratación, ver nota en recipe-lines-editor.tsx.
function initialVariant(): VariantDraft {
  return { key: "variant-inicial", name: "", price: "0", lines: [initialLine()] };
}

function linesToInput(lines: LineDraft[]): RecipeLineInput[] {
  return lines
    .filter((l) => l.ref)
    .map((l) => {
      const [kind, refId] = l.ref.split(":");
      return {
        ingredientId: kind === "ingredient" ? refId : undefined,
        composedRecipeId: kind === "composed" ? refId : undefined,
        quantity: Number(l.quantity) || 0,
        unit: l.unit,
      };
    });
}

const NEW_CATEGORY_VALUE = "__new__";

export function NewProductForm({
  categories,
  ingredientOptions,
  employeeId,
}: {
  categories: ProductCategoryOption[];
  ingredientOptions: { ingredients: IngredientOption[]; composedRecipes: ComposedRecipeOption[] };
  employeeId: string;
}) {
  const router = useRouter();
  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? NEW_CATEGORY_VALUE);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([initialVariant()]);
  const [ingredients, setIngredients] = useState(ingredientOptions.ingredients);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function handleSubmit() {
    setError(null);

    if (!productName.trim()) {
      setError("Captura el nombre del producto.");
      return;
    }

    startTransition(async () => {
      try {
        await createProductWithRecipe({
          employeeId,
          productName,
          categoryId: categoryId === NEW_CATEGORY_VALUE ? undefined : categoryId,
          newCategoryName: categoryId === NEW_CATEGORY_VALUE ? newCategoryName : undefined,
          variants: variants.map((v) => ({
            name: v.name,
            price: Number(v.price) || 0,
            lines: linesToInput(v.lines),
          })),
        });
        router.push("/recetas");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el producto.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Nuevo producto</h1>
        <p className="text-sm text-muted-foreground">
          Crea el producto, sus variantes y la receta de cada una.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del producto</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="product-name">Nombre</Label>
            <Input
              id="product-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="ej. Mocha"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="product-category">Categoría</Label>
            <Select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>+ Nueva categoría</option>
            </Select>
          </div>

          {categoryId === NEW_CATEGORY_VALUE && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-category-name">Nombre de la categoría nueva</Label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="ej. Café frío"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {variants.map((variant, index) => (
        <Card key={variant.key}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Variante {index + 1}</CardTitle>
            {variants.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setVariants((prev) => prev.filter((v) => v.key !== variant.key))}
              >
                Quitar variante
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`variant-name-${variant.key}`}>Nombre</Label>
                <Input
                  id={`variant-name-${variant.key}`}
                  value={variant.name}
                  onChange={(e) => updateVariant(variant.key, { name: e.target.value })}
                  placeholder="ej. Chico"
                />
              </div>
              <div className="flex w-32 flex-col gap-1">
                <Label htmlFor={`variant-price-${variant.key}`}>Precio</Label>
                <Input
                  id={`variant-price-${variant.key}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={variant.price}
                  onChange={(e) => updateVariant(variant.key, { price: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Receta</Label>
              <RecipeLinesEditor
                lines={variant.lines}
                onChange={(lines) => updateVariant(variant.key, { lines })}
                ingredients={ingredients}
                composedRecipes={ingredientOptions.composedRecipes}
                onIngredientCreated={(ingredient) => setIngredients((prev) => [...prev, ingredient])}
                employeeId={employeeId}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => setVariants((prev) => [...prev, emptyVariant()])}
      >
        + Agregar variante
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Guardando..." : "Crear producto"}
      </Button>
    </div>
  );
}
