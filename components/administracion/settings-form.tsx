"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTargetFoodCostPercent } from "@/actions/settings";

export function SettingsForm({ targetFoodCostPercent }: { targetFoodCostPercent: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(targetFoodCostPercent));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateTargetFoodCostPercent(Number(value) || 0);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la configuración.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-3">
        <div className="flex w-32 flex-col gap-1">
          <Label htmlFor="target-food-cost">% de food cost objetivo</Label>
          <Input
            id="target-food-cost"
            type="number"
            min="1"
            max="100"
            step="1"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Precio sugerido al crear/editar una receta = costo de ingredientes ÷ este %.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-600">Guardado.</p>}
    </div>
  );
}
