"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UnitOfMeasure } from "@prisma/client";
import type { VariantRecipeDetail, IngredientOption, ComposedRecipeOption } from "@/lib/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateVariantRecipe, type RecipeLineInput } from "@/actions/recipes";
import { RecipeLinesEditor, type LineDraft } from "./recipe-lines-editor";

// key = line.id (el id real de RecipeIngredient, ya estable/único) en vez de
// crypto.randomUUID() — useState corre en SSR y al hidratar, un valor
// aleatorio ahí produciría un key distinto en cada corrida y rompería la
// hidratación (ver misma nota en recipe-lines-editor.tsx).
function linesFromDetail(detail: VariantRecipeDetail): LineDraft[] {
  return detail.lines.map((line) => ({
    key: line.id,
    ref: line.ingredientId ? `ingredient:${line.ingredientId}` : `composed:${line.composedRecipeId}`,
    quantity: String(line.quantity),
    unit: line.unit as UnitOfMeasure,
  }));
}

export function EditRecipeForm({
  detail,
  ingredientOptions,
  employeeId,
}: {
  detail: VariantRecipeDetail;
  ingredientOptions: { ingredients: IngredientOption[]; composedRecipes: ComposedRecipeOption[] };
  employeeId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(detail.variantName);
  const [imageUrl, setImageUrl] = useState(detail.productImageUrl ?? "");
  const [price, setPrice] = useState(String(detail.price));
  const [isActive, setIsActive] = useState(detail.isActive);
  const [lines, setLines] = useState<LineDraft[]>(linesFromDetail(detail));
  const [ingredients, setIngredients] = useState(ingredientOptions.ingredients);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);

    const lineInputs: RecipeLineInput[] = lines
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

    startTransition(async () => {
      try {
        await updateVariantRecipe({
          employeeId,
          variantId: detail.variantId,
          name,
          price: Number(price) || 0,
          isActive,
          lines: lineInputs,
          imageUrl,
        });
        router.push("/recetas");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la receta.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">
          Editar receta — {detail.productName} {detail.variantName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {detail.categoryName} · versión activa actual: v{detail.activeVersionNumber}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Variante</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="variant-name">Nombre</Label>
              <Input id="variant-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex w-32 flex-col gap-1">
              <Label htmlFor="variant-price">Precio</Label>
              <Input
                id="variant-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="product-image">Imagen del producto (URL, opcional)</Label>
            <Input
              id="product-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Variante activa (disponible para vender)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receta (se guardará como nueva versión)</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeLinesEditor
            lines={lines}
            onChange={setLines}
            ingredients={ingredients}
            composedRecipes={ingredientOptions.composedRecipes}
            onIngredientCreated={(ingredient) => setIngredients((prev) => [...prev, ingredient])}
            employeeId={employeeId}
          />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </div>
  );
}
