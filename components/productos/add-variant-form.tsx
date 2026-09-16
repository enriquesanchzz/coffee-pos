"use client";

import { useState, useTransition } from "react";
import type { VariantTemperature } from "@prisma/client";
import type { ProductBasicInfo, IngredientOption, ComposedRecipeOption } from "@/lib/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addVariantToProduct, type RecipeLineInput } from "@/actions/recipes";
import { emptyLine, type LineDraft } from "./recipe-lines-editor";
import { modifierOptionsToInput, type ModifierOptionDraft } from "./modifier-options-editor";
import { VariantFields } from "./variant-fields";

// "+ Agregar variante" (punto 2, "Módulo Productos") — agrega una
// variante a un producto YA EXISTENTE, sin crear un producto nuevo. Usa
// los mismos campos que "Nuevo producto"/"Editar" vía VariantFields.
export function AddVariantForm({
  product,
  ingredientOptions,
  employeeId,
  targetFoodCostPercent,
  onSaved,
}: {
  product: ProductBasicInfo;
  ingredientOptions: { ingredients: IngredientOption[]; composedRecipes: ComposedRecipeOption[] };
  employeeId: string;
  targetFoodCostPercent: number;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [temperature, setTemperature] = useState<VariantTemperature | "">("");
  const [sizeOz, setSizeOz] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [milkOptions, setMilkOptions] = useState<ModifierOptionDraft[]>([]);
  const [extraOptions, setExtraOptions] = useState<ModifierOptionDraft[]>([]);
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
        await addVariantToProduct({
          employeeId,
          productId: product.id,
          variant: {
            name,
            price: Number(price) || 0,
            lines: lineInputs,
            temperature: temperature || undefined,
            sizeOz: sizeOz ? Number(sizeOz) : undefined,
            milkOptions: modifierOptionsToInput(milkOptions),
            extraOptions: modifierOptionsToInput(extraOptions),
            size: size || undefined,
            color: color || undefined,
            note: note || undefined,
          },
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo agregar la variante.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Agregar variante — {product.name}</h1>
        <p className="text-sm text-muted-foreground">{product.categoryName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Variante nueva</CardTitle>
        </CardHeader>
        <CardContent>
          <VariantFields
            idPrefix="new-variant"
            productType={product.type}
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
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar variante"}
      </Button>
    </div>
  );
}
