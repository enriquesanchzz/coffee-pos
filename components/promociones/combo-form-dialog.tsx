"use client";

import { useEffect, useState, useTransition } from "react";
import type { ComboListItem, VariantOption } from "@/lib/promotions";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCombo as createComboAction, updateCombo as updateComboAction } from "@/actions/promotions";
import { DaysOfWeekPicker } from "./days-of-week-picker";
import { ComboItemsEditor, type ComboItemDraft, initialComboItems } from "./combo-items-editor";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createCombo = withActionErrors(createComboAction);
const updateCombo = withActionErrors(updateComboAction);

function itemsFromCombo(combo: ComboListItem | null): ComboItemDraft[] {
  if (!combo || combo.items.length === 0) return initialComboItems();
  return combo.items.map((item) => ({
    key: crypto.randomUUID(),
    productVariantId: item.productVariantId,
    quantity: String(item.quantity),
  }));
}

// Crea o edita un paquete (Combo) — mismo patrón de diálogo único
// crear/editar, resincronizado por useEffect cuando `open` pasa a true
// (ver nota en IngredientFormDialog sobre por qué: un useState inicial
// no se reevalúa en cada apertura).
export function ComboFormDialog({
  open,
  combo,
  variants,
  employeeId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  combo: ComboListItem | null;
  variants: VariantOption[];
  employeeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(combo);
  const [name, setName] = useState(combo?.name ?? "");
  const [price, setPrice] = useState(combo ? String(combo.price) : "");
  const [items, setItems] = useState<ComboItemDraft[]>(itemsFromCombo(combo));
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(combo?.daysOfWeek ?? []);
  const [startTime, setStartTime] = useState(combo?.startTime ?? "");
  const [endTime, setEndTime] = useState(combo?.endTime ?? "");
  const [isActive, setIsActive] = useState(combo?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(combo?.name ?? "");
    setPrice(combo ? String(combo.price) : "");
    setItems(itemsFromCombo(combo));
    setDaysOfWeek(combo?.daysOfWeek ?? []);
    setStartTime(combo?.startTime ?? "");
    setEndTime(combo?.endTime ?? "");
    setIsActive(combo?.isActive ?? true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, combo]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          employeeId,
          name,
          price: Number(price) || 0,
          items: items
            .filter((item) => item.productVariantId)
            .map((item) => ({ productVariantId: item.productVariantId, quantity: Number(item.quantity) || 0 })),
          daysOfWeek,
          startTime: startTime || null,
          endTime: endTime || null,
        };
        if (isEdit && combo) {
          await updateCombo({ ...payload, comboId: combo.id, isActive });
        } else {
          await createCombo(payload);
        }
        onSaved();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el paquete.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Editar paquete" : "Nuevo paquete"} className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="combo-name">Nombre</Label>
          <Input id="combo-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Café + Croissant" />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="combo-price">Precio del paquete</Label>
          <Input id="combo-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Productos combinados (mínimo 2)</Label>
          <ComboItemsEditor items={items} onChange={setItems} variants={variants} />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Días en que aplica</Label>
          <DaysOfWeekPicker value={daysOfWeek} onChange={setDaysOfWeek} />
        </div>

        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="combo-start">Desde (opcional)</Label>
            <Input id="combo-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="combo-end">Hasta (opcional)</Label>
            <Input id="combo-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Activo
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear paquete"}
        </Button>
      </div>
    </Dialog>
  );
}
