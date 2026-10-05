"use client";

import { useEffect, useState, useTransition } from "react";
import type { DiscountType, PromotionCategory } from "@prisma/client";
import type { PromotionListItem, VariantOption } from "@/lib/promotions";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createPromotion as createPromotionAction, updatePromotion as updatePromotionAction } from "@/actions/promotions";
import { DaysOfWeekPicker } from "./days-of-week-picker";
import { VariantMultiPicker } from "./variant-multi-picker";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const createPromotion = withActionErrors(createPromotionAction);
const updatePromotion = withActionErrors(updatePromotionAction);

const CATEGORY_TITLES: Record<PromotionCategory, string> = {
  DOS_POR_UNO: "2x1",
  DIA_TEMATICO: "Día temático",
};

const discountTypeLabels: Record<DiscountType, string> = {
  PORCENTAJE: "% porcentaje",
  MONTO_FIJO: "monto fijo",
  PRECIO_FINAL: "precio final",
};

// Crea o edita una promoción de 2x1 o Día temático — la categoría viene
// fija por prop (se decide con qué botón se abrió el diálogo, "+ 2x1" o
// "+ Día temático"), no es un selector dentro del formulario, porque
// cada categoría tiene campos distintos (Día temático pide tipo+valor
// de descuento, 2x1 no). Mismo patrón de resincronización por useEffect
// que ComboFormDialog/IngredientFormDialog.
export function PromotionFormDialog({
  open,
  promotion,
  category,
  variants,
  employeeId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  promotion: PromotionListItem | null;
  category: PromotionCategory;
  variants: VariantOption[];
  employeeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(promotion);
  const [name, setName] = useState(promotion?.name ?? "");
  const [variantIds, setVariantIds] = useState<string[]>(promotion?.variants.map((v) => v.productVariantId) ?? []);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(promotion?.daysOfWeek ?? []);
  const [startTime, setStartTime] = useState(promotion?.startTime ?? "");
  const [endTime, setEndTime] = useState(promotion?.endTime ?? "");
  const [discountType, setDiscountType] = useState<DiscountType>(promotion?.discountType ?? "PORCENTAJE");
  const [discountValue, setDiscountValue] = useState(promotion?.discountValue ? String(promotion.discountValue) : "10");
  const [isActive, setIsActive] = useState(promotion?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(promotion?.name ?? "");
    setVariantIds(promotion?.variants.map((v) => v.productVariantId) ?? []);
    setDaysOfWeek(promotion?.daysOfWeek ?? []);
    setStartTime(promotion?.startTime ?? "");
    setEndTime(promotion?.endTime ?? "");
    setDiscountType(promotion?.discountType ?? "PORCENTAJE");
    setDiscountValue(promotion?.discountValue ? String(promotion.discountValue) : "10");
    setIsActive(promotion?.isActive ?? true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promotion]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          employeeId,
          name,
          category,
          variantIds,
          daysOfWeek,
          startTime: startTime || null,
          endTime: endTime || null,
          ...(category === "DIA_TEMATICO"
            ? { discountType, discountValue: Number(discountValue) || 0 }
            : {}),
        };
        if (isEdit && promotion) {
          await updatePromotion({ ...payload, promotionId: promotion.id, isActive });
        } else {
          await createPromotion(payload);
        }
        onSaved();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la promoción.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Editar ${CATEGORY_TITLES[category]}` : `Nuevo ${CATEGORY_TITLES[category]}`}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="promotion-name">Nombre</Label>
          <Input
            id="promotion-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={category === "DOS_POR_UNO" ? "ej. Martes 2x1 Frappé" : "ej. Jueves de Latte al 50%"}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Productos que califican</Label>
          <VariantMultiPicker variants={variants} selected={variantIds} onChange={setVariantIds} />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Días en que aplica</Label>
          <DaysOfWeekPicker value={daysOfWeek} onChange={setDaysOfWeek} />
        </div>

        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="promotion-start">Desde (opcional)</Label>
            <Input id="promotion-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="promotion-end">Hasta (opcional)</Label>
            <Input id="promotion-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {startTime && endTime && startTime > endTime
            ? `Cruza la medianoche: aplica de ${startTime} a ${endTime} del día siguiente.`
            : "Sin horario = todo el día. Si «Hasta» es menor que «Desde», cruza la medianoche."}
        </p>

        {category === "DIA_TEMATICO" && (
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="promotion-discount-type">Tipo de descuento</Label>
              <Select
                id="promotion-discount-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              >
                {Object.entries(discountTypeLabels).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex w-28 flex-col gap-1">
              <Label htmlFor="promotion-discount-value">Valor</Label>
              <Input
                id="promotion-discount-value"
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>
          </div>
        )}

        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Activo
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear promoción"}
        </Button>
      </div>
    </Dialog>
  );
}
