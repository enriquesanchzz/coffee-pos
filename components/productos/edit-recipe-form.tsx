"use client";

import { useState, useTransition } from "react";
import type { UnitOfMeasure, VariantTemperature } from "@prisma/client";
import type { VariantRecipeDetail, IngredientOption, ComposedRecipeOption, ModifierOptionDetail } from "@/lib/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateVariantRecipe, type RecipeLineInput } from "@/actions/recipes";
import { type LineDraft } from "./recipe-lines-editor";
import { modifierOptionsToInput, type ModifierOptionDraft } from "./modifier-options-editor";
import { VariantFields } from "./variant-fields";

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

function optionsFromDetail(options: ModifierOptionDetail[]): ModifierOptionDraft[] {
  return options.map((o) => ({
    key: o.id,
    ingredientId: o.ingredientId ?? "",
    quantity: String(o.quantity ?? 1),
    priceDelta: String(o.priceDelta),
  }));
}

export function EditRecipeForm({
  detail,
  ingredientOptions,
  employeeId,
  targetFoodCostPercent,
  onSaved,
}: {
  detail: VariantRecipeDetail;
  ingredientOptions: { ingredients: IngredientOption[]; composedRecipes: ComposedRecipeOption[] };
  employeeId: string;
  targetFoodCostPercent: number;
  onSaved: () => void;
}) {
  const [name, setName] = useState(detail.variantName);
  const [imageUrl, setImageUrl] = useState(detail.productImageUrl ?? "");
  const [price, setPrice] = useState(String(detail.price));
  const [isActive, setIsActive] = useState(detail.isActive);
  const [temperature, setTemperature] = useState<VariantTemperature | "">(detail.temperature ?? "");
  const [sizeOz, setSizeOz] = useState(detail.sizeOz !== null ? String(detail.sizeOz) : "");
  const [size, setSize] = useState(detail.size ?? "");
  const [color, setColor] = useState(detail.color ?? "");
  const [note, setNote] = useState(detail.note ?? "");
  const [lines, setLines] = useState<LineDraft[]>(linesFromDetail(detail));
  const [milkOptions, setMilkOptions] = useState<ModifierOptionDraft[]>(optionsFromDetail(detail.milkOptions));
  const [extraOptions, setExtraOptions] = useState<ModifierOptionDraft[]>(optionsFromDetail(detail.extraOptions));
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
          temperature: temperature || undefined,
          sizeOz: sizeOz ? Number(sizeOz) : undefined,
          milkOptions: modifierOptionsToInput(milkOptions),
          extraOptions: modifierOptionsToInput(extraOptions),
          size: size || undefined,
          color: color || undefined,
          note: note || undefined,
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la receta.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">
          Editar producto — {detail.productName} {detail.variantName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {detail.categoryName}
          {detail.activeVersionNumber !== null && ` · versión activa actual: v${detail.activeVersionNumber}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Variante</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="product-image">Imagen del producto (URL, opcional)</Label>
            <Input
              id="product-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <VariantFields
            idPrefix="variant"
            productType={detail.productType}
            name={name}
            onNameChange={setName}
            price={price}
            onPriceChange={setPrice}
            temperature={temperature}
            onTemperatureChange={setTemperature}
            sizeOz={sizeOz}
            onSizeOzChange={setSizeOz}
            size={size}
            onSizeChange={setSize}
            color={color}
            onColorChange={setColor}
            note={note}
            onNoteChange={setNote}
            lines={lines}
            onLinesChange={setLines}
            milkOptions={milkOptions}
            onMilkOptionsChange={setMilkOptions}
            extraOptions={extraOptions}
            onExtraOptionsChange={setExtraOptions}
            ingredients={ingredients}
            composedRecipes={ingredientOptions.composedRecipes}
            onIngredientCreated={(ingredient) => setIngredients((prev) => [...prev, ingredient])}
            employeeId={employeeId}
            targetFoodCostPercent={targetFoodCostPercent}
          />

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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </div>
  );
}
