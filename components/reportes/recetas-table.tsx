"use client";

import { useMemo, useState } from "react";
import type { RecipeCostReportItem } from "@/lib/reports";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { temperatureLabels } from "@/components/productos/enum-labels";
import { cn, formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { matchesSearch } from "@/lib/search";

type SortKey = "nombre" | "margenAsc" | "margenDesc" | "costoDesc";

// Antes eran 100+ tarjetas en una sola columna sin forma de buscar ni
// ordenar (QA-026). Tabla con búsqueda y orden; el historial de costo de
// cada receta se despliega en su renglón.
export function RecetasTable({ items }: { items: RecipeCostReportItem[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("nombre");

  const rows = useMemo(() => {
    const filtered = items.filter((item) =>
      matchesSearch(query, item.productName, item.variantName, item.categoryName)
    );
    const sorted = [...filtered];
    if (sort === "margenAsc") sorted.sort((a, b) => a.marginPct - b.marginPct);
    if (sort === "margenDesc") sorted.sort((a, b) => b.marginPct - a.marginPct);
    if (sort === "costoDesc") sorted.sort((a, b) => b.currentCost - a.currentCost);
    return sorted;
  }, [items, query, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar receta…"
          aria-label="Buscar receta"
        />
        <Select className="w-56" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por">
          <option value="nombre">Ordenar por nombre</option>
          <option value="margenAsc">Menor margen primero</option>
          <option value="margenDesc">Mayor margen primero</option>
          <option value="costoDesc">Mayor costo primero</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Costo y margen de cada receta</caption>
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Receta</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Precio</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Costo</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Margen</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  Ninguna receta coincide.
                </td>
              </tr>
            )}
            {rows.map((item) => (
              <tr key={item.variantId} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <p className="font-medium">
                    {item.productName} {item.variantName}
                    {item.temperature && ` · ${temperatureLabels[item.temperature]}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.categoryName}</p>
                  {item.history.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Historial de costo ({item.history.length})
                      </summary>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {item.history.map((entry) => (
                          <li key={entry.id} className="flex justify-between gap-3">
                            <span>{formatDateTime(entry.recordedAt)}</span>
                            <span className="text-muted-foreground">{entry.reason}</span>
                            <span>{formatCurrency(entry.totalCost)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </th>
                <td className="px-3 py-2 text-right">{formatCurrency(item.price)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(item.currentCost)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(item.margin)}</td>
                <td className={cn("px-3 py-2 text-right font-medium", item.marginPct < 50 && "text-destructive")}>
                  {item.marginPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
