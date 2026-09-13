"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductType, VariantTemperature } from "@prisma/client";
import type { ProductCategoryOption, IngredientOption, ComposedRecipeOption } from "@/lib/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createProductWithRecipe, type RecipeLineInput } from "@/actions/recipes";
import { emptyLine, initialLine, type LineDraft } from "./recipe-lines-editor";
import { emptyModifierOption, modifierOptionsToInput, type ModifierOptionDraft } from "./modifier-options-editor";
import { VariantFields } from "./variant-fields";

type VariantDraft = {
  key: string;
  name: string;
  price: string;
  lines: LineDraft[];
  temperature: VariantTemperature | "";
  sizeOz: string;
  milkOptions: ModifierOptionDraft[];
  extraOptions: ModifierOptionDraft[];
  size: string;
  color: string;
  note: string;
};

// Usada por "+ Agregar variante" (solo en el cliente, después de montar) —
// crypto.randomUUID() aquí es seguro porque nunca corre durante SSR.
function emptyVariant(): VariantDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    price: "0",
    lines: [emptyLine()],
    temperature: "",
    sizeOz: "",
    milkOptions: [],
    extraOptions: [],
    size: "",
    color: "",
    note: "",
  };
}

// Estado inicial del formulario (useState corre en SSR y al hidratar) — key
// fijo para no romper la hidratación, ver nota en recipe-lines-editor.tsx.
function initialVariant(): VariantDraft {
  return {
    key: "variant-inicial",
    name: "",
    price: "0",
    lines: [initialLine()],
    temperature: "",
    sizeOz: "",
    milkOptions: [],
    extraOptions: [],
    size: "",
    color: "",
    note: "",
  };
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
  const [productType, setProductType] = useState<ProductType>("RECETA");
  const [productName, setProductName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? NEW_CATEGORY_VALUE);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([initialVariant()]);
  const [ingredients, setIngredients] = useState(ingredientOptions.ingredients);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const standaloneCategories = categories.filter((c) => !c.parentId);
  const categoriesByParent = new Map<string, ProductCategoryOption[]>();
  for (const c of categories) {
    if (c.parentId && c.parentName) {
      categoriesByParent.set(c.parentName, [...(categoriesByParent.get(c.parentName) ?? []), c]);
    }
  }

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
          type: productType,
          imageUrl: imageUrl || undefined,
          categoryId: categoryId === NEW_CATEGORY_VALUE ? undefined : categoryId,
          newCategoryName: categoryId === NEW_CATEGORY_VALUE ? newCategoryName : undefined,
          variants: variants.map((v) => ({
            name: v.name,
            price: Number(v.price) || 0,
            lines: linesToInput(v.lines),
            temperature: v.temperature || undefined,
            sizeOz: v.sizeOz ? Number(v.sizeOz) : undefined,
            milkOptions: modifierOptionsToInput(v.milkOptions),
            extraOptions: modifierOptionsToInput(v.extraOptions),
            size: v.size || undefined,
            color: v.color || undefined,
            note: v.note || undefined,
          })),
        });
        router.push("/productos");
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
          Crea el producto, sus variantes y — si es una bebida — la receta de cada una.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del producto</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label>Tipo de producto</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "RECETA" as const, label: "Bebida (con receta)" },
                  { value: "REVENTA_DIRECTA" as const, label: "Reventa directa (merch, souvenirs, tarjetas)" },
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setProductType(opt.value)}
                  className={cn(
                    "flex-1 rounded-md border border-border px-3 py-2 text-sm",
                    productType === opt.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

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
            <Label htmlFor="product-image">Imagen (URL, opcional)</Label>
            <Input
              id="product-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="product-category">Categoría</Label>
            <Select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {standaloneCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {Array.from(categoriesByParent.entries()).map(([parentName, cats]) => (
                <optgroup key={parentName} label={parentName}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
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
          <CardContent>
            <VariantFields
              idPrefix={variant.key}
              productType={productType}
              name={variant.name}
              onNameChange={(v) => updateVariant(variant.key, { name: v })}
              price={variant.price}
              onPriceChange={(v) => updateVariant(variant.key, { price: v })}
              temperature={variant.temperature}
              onTemperatureChange={(v) => updateVariant(variant.key, { temperature: v })}
              sizeOz={variant.sizeOz}
              onSizeOzChange={(v) => updateVariant(variant.key, { sizeOz: v })}
              size={variant.size}
              onSizeChange={(v) => updateVariant(variant.key, { size: v })}
              color={variant.color}
              onColorChange={(v) => updateVariant(variant.key, { color: v })}
              note={variant.note}
              onNoteChange={(v) => updateVariant(variant.key, { note: v })}
              lines={variant.lines}
              onLinesChange={(v) => updateVariant(variant.key, { lines: v })}
              milkOptions={variant.milkOptions}
              onMilkOptionsChange={(v) => updateVariant(variant.key, { milkOptions: v })}
              extraOptions={variant.extraOptions}
              onExtraOptionsChange={(v) => updateVariant(variant.key, { extraOptions: v })}
              ingredients={ingredients}
              composedRecipes={ingredientOptions.composedRecipes}
              onIngredientCreated={(ingredient) => setIngredients((prev) => [...prev, ingredient])}
              employeeId={employeeId}
            />
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
