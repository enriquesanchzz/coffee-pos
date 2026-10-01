"use client";

import type { VariantOption } from "@/lib/promotions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type ComboItemDraft = { key: string; productVariantId: string; quantity: string };

export function emptyComboItem(): ComboItemDraft {
  return { key: crypto.randomUUID(), productVariantId: "", quantity: "1" };
}

// Para el estado inicial de un formulario (useState corre tanto en SSR
// como al hidratar) — crypto.randomUUID() ahí daría un key distinto en
// cada corrida y rompería la hidratación. Mismo patrón que
// RecipeLinesEditor.initialLine().
export function initialComboItems(): ComboItemDraft[] {
  return [
    { key: "combo-item-1", productVariantId: "", quantity: "1" },
    { key: "combo-item-2", productVariantId: "", quantity: "1" },
  ];
}

// Líneas de producto+cantidad de un paquete — mismo patrón que
// RecipeLinesEditor (Productos), pero sin unidad/conversión: la
// cantidad aquí es un conteo de piezas del producto, no una medida de
// ingrediente.
export function ComboItemsEditor({
  items,
  onChange,
  variants,
}: {
  items: ComboItemDraft[];
  onChange: (items: ComboItemDraft[]) => void;
  variants: VariantOption[];
}) {
  function updateItem(key: string, patch: Partial<ComboItemDraft>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeItem(key: string) {
    onChange(items.filter((item) => item.key !== key));
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <Select
            className="flex-1"
            value={item.productVariantId}
            onChange={(e) => updateItem(item.key, { productVariantId: e.target.value })}
          >
            <option value="">Selecciona un producto…</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.productName} {v.variantName}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min="1"
            step="1"
            className="w-20"
            value={item.quantity}
            onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.key)}>
            Quitar
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, emptyComboItem()])}>
        + Agregar producto
      </Button>
    </div>
  );
}
