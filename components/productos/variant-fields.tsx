"use client";

import type { ProductType, VariantTemperature } from "@prisma/client";
import type { IngredientOption, ComposedRecipeOption } from "@/lib/recipes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { temperatureLabels } from "./enum-labels";
import { RecipeLinesEditor, type LineDraft } from "./recipe-lines-editor";
import { ModifierOptionsEditor, type ModifierOptionDraft } from "./modifier-options-editor";
import { computeLinesCost } from "./recipe-cost";

const TEMPERATURE_CHOICES: (VariantTemperature | "")[] = ["", "CALIENTE", "FRIO", "FRAPPE"];

// Campos de una variante — nombre/precio siempre, y luego según el tipo
// de producto: bebida (RECETA) gana temperatura/oz/receta/tipo de leche/
// extras (puntos 3-7 de "Módulo Productos"); reventa directa
// (REVENTA_DIRECTA, merch/souvenirs/tarjetas) gana talla/color/nota en
// vez de receta. Compartido por el formulario de producto nuevo, el de
// editar variante y el de agregar variante a un producto existente.
export function VariantFields({
  idPrefix,
  productType,
  name,
  onNameChange,
  price,
  onPriceChange,
  temperature,
  onTemperatureChange,
  sizeOz,
  onSizeOzChange,
  size,
  onSizeChange,
  color,
  onColorChange,
  note,
  onNoteChange,
  lines,
  onLinesChange,
  milkOptions,
  onMilkOptionsChange,
  extraOptions,
  onExtraOptionsChange,
  ingredients,
  composedRecipes,
  onIngredientCreated,
  employeeId,
  targetFoodCostPercent,
}: {
  idPrefix: string;
  productType: ProductType;
  name: string;
  onNameChange: (v: string) => void;
  price: string;
  onPriceChange: (v: string) => void;
  temperature: VariantTemperature | "";
  onTemperatureChange: (v: VariantTemperature | "") => void;
  sizeOz: string;
  onSizeOzChange: (v: string) => void;
  size: string;
  onSizeChange: (v: string) => void;
  color: string;
  onColorChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  lines: LineDraft[];
  onLinesChange: (v: LineDraft[]) => void;
  milkOptions: ModifierOptionDraft[];
  onMilkOptionsChange: (v: ModifierOptionDraft[]) => void;
  extraOptions: ModifierOptionDraft[];
  onExtraOptionsChange: (v: ModifierOptionDraft[]) => void;
  ingredients: IngredientOption[];
  composedRecipes: ComposedRecipeOption[];
  onIngredientCreated: (i: IngredientOption) => void;
  employeeId: string;
  // % de food cost objetivo (Branch.targetFoodCostPercent), para el
  // precio sugerido debajo de la receta — ver Administración.
  targetFoodCostPercent: number;
}) {
  const recipeCost = computeLinesCost(lines, ingredients, composedRecipes);
  const suggestedPrice = recipeCost > 0 ? recipeCost / (targetFoodCostPercent / 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={`${idPrefix}-name`}>Nombre</Label>
          <Input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="ej. Chico"
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <Label htmlFor={`${idPrefix}-price`}>Precio</Label>
          <Input
            id={`${idPrefix}-price`}
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
          />
        </div>
      </div>

      {productType === "RECETA" ? (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <Label>Temperatura</Label>
              <div className="flex gap-2">
                {TEMPERATURE_CHOICES.map((t) => (
                  <button
                    key={t || "ninguna"}
                    type="button"
                    onClick={() => onTemperatureChange(t)}
                    className={cn(
                      "rounded-md border border-border px-3 py-1.5 text-sm",
                      temperature === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {t === "" ? "Sin eje" : temperatureLabels[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex w-32 flex-col gap-1">
              <Label htmlFor={`${idPrefix}-oz`}>Tamaño (oz)</Label>
              <Input
                id={`${idPrefix}-oz`}
                type="number"
                min="0"
                step="0.5"
                value={sizeOz}
                onChange={(e) => onSizeOzChange(e.target.value)}
                placeholder="ej. 12"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            El tamaño en onzas decide qué vaso se descuenta automáticamente
            al vender — no hace falta agregarlo como ingrediente.
          </p>

          <div className="flex flex-col gap-1">
            <Label>Receta</Label>
            <RecipeLinesEditor
              lines={lines}
              onChange={onLinesChange}
              ingredients={ingredients}
              composedRecipes={composedRecipes}
              onIngredientCreated={onIngredientCreated}
              employeeId={employeeId}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p>
              Costo de ingredientes: <span className="font-medium">{formatCurrency(recipeCost)}</span>
            </p>
            {recipeCost > 0 ? (
              <>
                <p>
                  Precio sugerido (food cost {targetFoodCostPercent}%):{" "}
                  <span className="font-medium">{formatCurrency(suggestedPrice)}</span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPriceChange(suggestedPrice.toFixed(2))}
                >
                  Usar precio sugerido
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">Agrega ingredientes con costo para ver un precio sugerido.</p>
            )}
          </div>

          <ModifierOptionsEditor
            title="Tipo de leche"
            helpText="Alternativas a la leche que ya usa la receta — la opción base se agrega sola, sin costo."
            rows={milkOptions}
            onChange={onMilkOptionsChange}
            ingredientOptions={ingredients.filter((i) => i.category === "LECHE")}
          />

          <ModifierOptionsEditor
            title="Extras"
            helpText="Adiciones comunes, ej. shot extra de café, pump de vainilla."
            rows={extraOptions}
            onChange={onExtraOptionsChange}
            ingredientOptions={ingredients}
          />
        </>
      ) : (
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${idPrefix}-size`}>Talla (opcional)</Label>
            <Input id={`${idPrefix}-size`} value={size} onChange={(e) => onSizeChange(e.target.value)} placeholder="ej. M" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${idPrefix}-color`}>Color (opcional)</Label>
            <Input id={`${idPrefix}-color`} value={color} onChange={(e) => onColorChange(e.target.value)} placeholder="ej. Negro" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${idPrefix}-note`}>Nota (opcional)</Label>
            <Input id={`${idPrefix}-note`} value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder="ej. Edición limitada" />
          </div>
        </div>
      )}
    </div>
  );
}
