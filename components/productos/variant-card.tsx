"use client";

import { Plus } from "lucide-react";
import type { RecipeOverviewVariant } from "@/lib/recipes";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { temperatureLabels } from "./enum-labels";

// Tarjeta de variante — mismo lenguaje visual que ProductCard (rounded-2xl,
// clic para abrir), reemplaza el menú lateral angosto que era VariantNav:
// seleccionar un tamaño/variante ahora es el mismo patrón de tarjetas que
// el resto del drilldown de categoría → producto, no un mecanismo aparte.
export function VariantCard({
  variant,
  onSelect,
}: {
  variant: RecipeOverviewVariant;
  onSelect: (variantId: string) => void;
}) {
  return (
    <Card
      className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl p-4 text-center transition-shadow hover:shadow-md"
      onClick={() => onSelect(variant.id)}
    >
      <p className="text-sm font-semibold leading-tight">{variant.name}</p>
      {variant.temperature && (
        <p className="text-xs text-muted-foreground">{temperatureLabels[variant.temperature]}</p>
      )}
      <p className="text-sm text-muted-foreground">{formatCurrency(variant.price)}</p>
      {!variant.isActive && (
        <Badge variant="outline" className="text-[10px]">
          inactiva
        </Badge>
      )}
    </Card>
  );
}

export function AddVariantCard({ onClick }: { onClick: () => void }) {
  return (
    <Card
      className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-dashed p-4 text-center text-muted-foreground transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <Plus className="h-6 w-6" />
      <p className="text-sm font-medium">Agregar variante</p>
    </Card>
  );
}
