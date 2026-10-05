"use client";

import { useEffect, useState, useTransition } from "react";
import type { DiscountType, DiscountCodeCategory } from "@prisma/client";
import type { DiscountCodeListItem } from "@/lib/discounts";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createDiscountCode as createDiscountCodeAction, updateDiscountCode as updateDiscountCodeAction } from "@/actions/discounts";
import { discountTypeLabels, discountCategoryLabels } from "./enum-labels";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createDiscountCode = withActionErrors(createDiscountCodeAction);
const updateDiscountCode = withActionErrors(updateDiscountCodeAction);

// Crea o edita un código de descuento — mismo diálogo para ambos casos,
// mismo patrón que IngredientFormDialog (Inventario): montado de forma
// permanente en el workspace, `open`/`discountCode` cambian por prop, así
// que hay que resincronizar los campos con un efecto cuando `open` pasa a
// true (un useState inicial no se reevalúa en cada apertura).
export function DiscountCodeFormDialog({
  open,
  discountCode,
  employeeId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  discountCode: DiscountCodeListItem | null;
  employeeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(discountCode);
  const [code, setCode] = useState(discountCode?.code ?? "");
  const [type, setType] = useState<DiscountType>((discountCode?.type as DiscountType) ?? "PORCENTAJE");
  const [value, setValue] = useState(discountCode ? String(discountCode.value) : "10");
  const [category, setCategory] = useState<DiscountCodeCategory | "">(discountCode?.category ?? "");
  const [expiresAt, setExpiresAt] = useState(
    discountCode?.expiresAt ? discountCode.expiresAt.slice(0, 10) : ""
  );
  const [isActive, setIsActive] = useState(discountCode?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setCode(discountCode?.code ?? "");
    setType((discountCode?.type as DiscountType) ?? "PORCENTAJE");
    setValue(discountCode ? String(discountCode.value) : "10");
    setCategory(discountCode?.category ?? "");
    setExpiresAt(discountCode?.expiresAt ? discountCode.expiresAt.slice(0, 10) : "");
    setIsActive(discountCode?.isActive ?? true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, discountCode]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit && discountCode) {
          await updateDiscountCode({
            employeeId,
            discountCodeId: discountCode.id,
            code,
            type,
            value: Number(value) || 0,
            expiresAt: expiresAt || undefined,
            category: category || null,
            isActive,
          });
        } else {
          await createDiscountCode({
            employeeId,
            code,
            type,
            value: Number(value) || 0,
            expiresAt: expiresAt || undefined,
            category: category || null,
          });
        }
        onSaved();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el código.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Editar código" : "Nuevo código"}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="discount-code">Código</Label>
          <Input id="discount-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ej. VERANO10" />
        </div>

        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="discount-type">Tipo</Label>
            <Select id="discount-type" value={type} onChange={(e) => setType(e.target.value as DiscountType)}>
              {Object.entries(discountTypeLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor="discount-value">Valor</Label>
            <Input
              id="discount-value"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="discount-category">Categoría</Label>
          <Select
            id="discount-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as DiscountCodeCategory | "")}
          >
            <option value="">Sin categoría</option>
            {Object.entries(discountCategoryLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="discount-expires">Expira (opcional)</Label>
          <Input id="discount-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Activo
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear código"}
        </Button>
      </div>
    </Dialog>
  );
}
