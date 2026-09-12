"use client";

import { useMemo, useState } from "react";
import { Coffee, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { cn, formatCurrency, posAccentClass, posAccentBorderClass } from "@/lib/utils";
import {
  resolveProductVariant,
  type CatalogProduct,
  type CatalogVariant,
  type VariantTemperature,
} from "@/lib/catalog";
import { Button } from "@/components/ui/button";

const temperatureLabels: Record<VariantTemperature, string> = {
  CALIENTE: "Caliente",
  FRIO: "Frío",
};

// Tarjeta de catálogo: selección rápida de tamaño/temperatura + cantidad,
// con un botón "Agregar" que va directo al carrito sin abrir el diálogo
// (sin modificadores/extras/notas — para eso está "Personalizar"). Reusa
// resolveProductVariant (lib/catalog.ts) para no duplicar la lógica de
// resolución de variante que ya usa ProductDialog.
export function ProductCard({
  product,
  onQuickAdd,
  onCustomize,
}: {
  product: CatalogProduct;
  onQuickAdd: (product: CatalogProduct, variant: CatalogVariant, quantity: number) => void;
  onCustomize: (product: CatalogProduct) => void;
}) {
  const first = product.variants[0] ?? null;
  const [sizeLabel, setSizeLabel] = useState<string | null>(first?.sizeLabel ?? null);
  const [temperature, setTemperature] = useState<VariantTemperature | null>(
    first?.temperature ?? null
  );
  const [quantity, setQuantity] = useState(1);

  const sizes = useMemo(() => {
    const seen = new Set<string>();
    for (const v of product.variants) if (v.sizeLabel) seen.add(v.sizeLabel);
    return Array.from(seen);
  }, [product]);

  const temperatures = useMemo(() => {
    const seen = new Set<VariantTemperature>();
    for (const v of product.variants) if (v.temperature) seen.add(v.temperature);
    return Array.from(seen);
  }, [product]);

  const variant = useMemo(
    () => resolveProductVariant(product, sizeLabel, temperature),
    [product, sizeLabel, temperature]
  );

  // La tarjeta no tiene UI para elegir modificadores (sabor, tipo de leche,
  // etc.) — si la variante tiene algún grupo obligatorio (ej. "Sabor" en
  // Chai/Malteada/Soda Italiana), "Agregar" no puede satisfacerlo y hay que
  // forzar "Personalizar", igual que ProductDialog ya bloquea su propio
  // botón cuando falta un grupo requerido.
  const hasRequiredModifiers = variant?.modifierGroups.some((g) => g.isRequired) ?? false;
  const canQuickAdd = Boolean(variant) && !hasRequiredModifiers;

  function handleQuickAdd() {
    if (!canQuickAdd || !variant) return;
    onQuickAdd(product, variant, quantity);
    setQuantity(1);
  }

  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => onCustomize(product)}
        className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted"
      >
        {product.imageUrl ? (
          // Imagen por URL externa — no hay storage de archivos configurado.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <Coffee className="h-8 w-8 text-muted-foreground" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <button type="button" onClick={() => onCustomize(product)} className="text-left">
          <p className="font-semibold leading-tight">{product.name}</p>
          <p className="text-sm text-muted-foreground">
            {variant ? formatCurrency(variant.price) : "No disponible"}
          </p>
        </button>

        {sizes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSizeLabel(size)}
                className={cn(
                  "rounded-full border border-border px-2.5 py-1 text-xs",
                  sizeLabel === size ? posAccentBorderClass : "hover:bg-muted"
                )}
              >
                {size}
              </button>
            ))}
          </div>
        )}

        {temperatures.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {temperatures.map((temp) => (
              <button
                key={temp}
                type="button"
                onClick={() => setTemperature(temp)}
                className={cn(
                  "rounded-full border border-border px-2.5 py-1 text-xs",
                  temperature === temp ? posAccentBorderClass : "hover:bg-muted"
                )}
              >
                {temperatureLabels[temp]}
              </button>
            ))}
          </div>
        )}

        {!variant && (
          <p className="text-xs text-destructive">Esta combinación no está disponible.</p>
        )}
        {hasRequiredModifiers && (
          <p className="text-xs text-muted-foreground">Elige opciones en “Personalizar”.</p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 flex-shrink-0 rounded-full"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-5 flex-shrink-0 text-center text-sm">{quantity}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 flex-shrink-0 rounded-full"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => onCustomize(product)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Personalizar
            </Button>
            <Button
              size="sm"
              className={cn("flex-shrink-0 rounded-full", posAccentClass)}
              onClick={handleQuickAdd}
              disabled={!canQuickAdd}
            >
              Agregar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
