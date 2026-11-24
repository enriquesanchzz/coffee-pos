"use client";

import type { ProductOption } from "@/lib/promotions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { randomId } from "@/lib/id";

export type ComboItemDraft = { key: string; productId: string; quantity: string };

export function emptyComboItem(): ComboItemDraft {
  return { key: randomId(), productId: "", quantity: "1" };
}

// Para el estado inicial de un formulario (useState corre tanto en SSR
// como al hidratar) — crypto.randomUUID() ahí daría un key distinto en
// cada corrida y rompería la hidratación. Mismo patrón que
// RecipeLinesEditor.initialLine().
export function initialComboItems(): ComboItemDraft[] {
  return [
    { key: "combo-item-1", productId: "", quantity: "1" },
    { key: "combo-item-2", productId: "", quantity: "1" },
  ];
}

// Líneas de producto+cantidad de un paquete — se elige el PRODUCTO
// completo, no una variante específica: cualquier variante activa
// (frío/caliente, tamaño, etc.) cuenta para esta línea al vender, el
// cliente/cajero la elige en el POS (ver applyPromotions en
// actions/pos.ts). Mismo patrón que RecipeLinesEditor (Productos), pero
// sin unidad/conversión: la cantidad aquí es un conteo de piezas.
export function ComboItemsEditor({
  items,
  onChange,
  products,
}: {
  items: ComboItemDraft[];
  onChange: (items: ComboItemDraft[]) => void;
  products: ProductOption[];
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
          <Combobox
            className="flex-1"
            aria-label="Producto del paquete"
            placeholder="Busca un producto…"
            value={item.productId || null}
            onChange={(productId) => updateItem(item.key, { productId })}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
          />
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
      <p className="text-xs text-muted-foreground">
        Cualquier variante del producto (frío/caliente, tamaño, etc.) cuenta para el paquete.
      </p>
    </div>
  );
}
