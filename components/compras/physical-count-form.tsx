"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IngredientTheoreticalStock } from "@/lib/counts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPhysicalCount } from "@/actions/counts";
import { unitLabels } from "./enum-labels";

export function PhysicalCountForm({
  employeeId,
  ingredients,
}: {
  employeeId: string;
  ingredients: IngredientTheoreticalStock[];
}) {
  const router = useRouter();
  const [physicalQty, setPhysicalQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(ingredients.map((i) => [i.ingredientId, String(i.theoreticalQty)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPhysicalCount({
          employeeId,
          lines: ingredients.map((i) => ({
            ingredientId: i.ingredientId,
            physicalQty: Number(physicalQty[i.ingredientId]) || 0,
          })),
        });
        router.push(`/compras/conteos/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el conteo.");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">Nuevo conteo físico</h1>
      <p className="text-sm text-muted-foreground">
        Captura la cantidad real de cada ingrediente. Lo que cambies contra el stock teórico se
        aplicará solo si un segundo empleado aprueba el conteo.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-4">
          {ingredients.map((ingredient) => {
            const unitLabel = unitLabels[ingredient.baseUnit as keyof typeof unitLabels] ?? ingredient.baseUnit;
            return (
              <div key={ingredient.ingredientId} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{ingredient.name}</span>
                <span className="w-28 text-right text-xs text-muted-foreground">
                  teórico: {ingredient.theoreticalQty} {unitLabel}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-28"
                  value={physicalQty[ingredient.ingredientId] ?? ""}
                  onChange={(e) =>
                    setPhysicalQty((prev) => ({ ...prev, [ingredient.ingredientId]: e.target.value }))
                  }
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Guardando..." : "Enviar conteo a aprobación"}
      </Button>
    </div>
  );
}
