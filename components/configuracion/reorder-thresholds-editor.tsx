"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateReorderThresholds as updateReorderThresholdsAction } from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { matchesSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

const updateReorderThresholds = withActionErrors(updateReorderThresholdsAction);

export type ThresholdRow = {
  ingredientId: string;
  name: string;
  categoryName: string;
  unit: string;
  quantity: number;
  threshold: number | null;
};

// Mínimo de stock por insumo: al llegar a este valor el insumo se marca
// "stock bajo" en Inventario y en el Dashboard. Antes el modelo existía
// pero nada lo llenaba, así que solo se avisaba al llegar a 0.
export function ReorderThresholdsEditor({ rows }: { rows: ThresholdRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.ingredientId, r.threshold === null ? "" : String(r.threshold)]))
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const original = Object.fromEntries(rows.map((r) => [r.ingredientId, r.threshold === null ? "" : String(r.threshold)]));
  const dirtyIds = rows.map((r) => r.ingredientId).filter((id) => (values[id] ?? "") !== original[id]);
  const visible = rows.filter((r) => matchesSearch(query, r.name, r.categoryName));

  useEffect(() => {
    if (dirtyIds.length === 0) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

  function handleSave() {
    setError(null);
    setSaved(null);
    const payload = dirtyIds.map((id) => {
      const text = values[id].trim();
      return { ingredientId: id, threshold: text === "" ? null : Number(text) };
    });
    const invalid = payload.find((p) => p.threshold !== null && !(p.threshold >= 0));
    if (invalid) {
      setError(`${rows.find((r) => r.ingredientId === invalid.ingredientId)?.name}: el mínimo debe ser 0 o mayor.`);
      return;
    }
    startTransition(async () => {
      try {
        await updateReorderThresholds(payload);
        setSaved(`Se guardaron ${payload.length} mínimo${payload.length === 1 ? "" : "s"}.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron guardar los mínimos.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Mínimos de stock</CardTitle>
        <p className="text-sm text-muted-foreground">
          Al llegar al mínimo, el insumo se marca como &quot;stock bajo&quot; en Inventario y en el Dashboard. Vacío =
          solo se avisa cuando se acaba.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar insumo…"
          aria-label="Buscar insumo"
          className="max-w-xs rounded-full"
        />
        <div className="hidden grid-cols-[1fr_8rem_9rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>Insumo</span>
          <span className="text-right">Existencia</span>
          <span>Mínimo</span>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {visible.map((row) => {
            const value = values[row.ingredientId] ?? "";
            const min = value.trim() === "" ? null : Number(value);
            const isLow = row.quantity <= 0 || (min !== null && row.quantity <= min);
            return (
              <li key={row.ingredientId} className="grid grid-cols-[1fr_auto] items-center gap-2 py-2 text-sm sm:grid-cols-[1fr_8rem_9rem]">
                <div className="min-w-0">
                  <p className="truncate">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.categoryName}</p>
                </div>
                <span className={cn("hidden text-right sm:block", isLow && "font-medium text-destructive")}>
                  {new Intl.NumberFormat("es-MX").format(row.quantity)} {row.unit}
                </span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="w-24"
                    aria-label={`Mínimo de ${row.name} en ${row.unit}`}
                    value={value}
                    onChange={(e) => {
                      setSaved(null);
                      setValues((prev) => ({ ...prev, [row.ingredientId]: e.target.value }));
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{row.unit}</span>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && <li className="py-2 text-sm text-muted-foreground">Ningún insumo coincide.</li>}
        </ul>
        {error && <Alert variant="error">{error}</Alert>}
        {saved && !error && <Alert variant="success">{saved}</Alert>}
        <Button type="button" className="w-fit" onClick={handleSave} disabled={isPending || dirtyIds.length === 0}>
          {isPending
            ? "Guardando..."
            : dirtyIds.length === 0
              ? "Sin cambios por guardar"
              : `Guardar mínimos (${dirtyIds.length})`}
        </Button>
      </CardContent>
    </Card>
  );
}
