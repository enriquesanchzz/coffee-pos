"use client";

import type { VariantOption } from "@/lib/promotions";

// Multi-selección de variantes para 2x1/Día temático — a diferencia de
// Paquetes, aquí no hace falta cantidad por línea, solo qué productos
// califican para la promoción.
export function VariantMultiPicker({
  variants,
  selected,
  onChange,
}: {
  variants: VariantOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((v) => v !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
      {variants.map((v) => (
        <label key={v.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selected.includes(v.id)} onChange={() => toggle(v.id)} />
          {v.productName} {v.variantName}
        </label>
      ))}
    </div>
  );
}
