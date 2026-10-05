"use client";

import { useState } from "react";
import type { VariantOption } from "@/lib/promotions";
import { Input } from "@/components/ui/input";
import { matchesSearch } from "@/lib/search";

// Multi-selección de variantes para 2x1/Día temático — a diferencia de
// Paquetes, aquí no hace falta cantidad por línea, solo qué productos
// califican para la promoción. Con buscador: el menú tiene 150+ variantes
// (QA-017).
export function VariantMultiPicker({
  variants,
  selected,
  onChange,
}: {
  variants: VariantOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = variants.filter((v) => matchesSearch(query, v.productName, v.variantName));

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((v) => v !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filtrar productos…"
        aria-label="Filtrar productos"
      />
      <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
        <legend className="sr-only">Productos que califican</legend>
        {visible.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
        {visible.map((v) => (
          <label key={v.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(v.id)} onChange={() => toggle(v.id)} />
            {v.productName} {v.variantName}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {selected.length === 0 ? "Ningún producto elegido." : `${selected.length} elegido${selected.length === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
