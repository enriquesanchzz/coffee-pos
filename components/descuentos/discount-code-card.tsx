"use client";

import type { DiscountCodeListItem } from "@/lib/discounts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { discountTypeLabels, discountCategoryLabels } from "./enum-labels";
import { formatDate } from "@/lib/time";

// Misma tarjeta que ProductCard/VariantCard (rounded-2xl, clic para abrir)
// pero horizontal — aquí no hay una imagen/ícono que centrar, es
// información de texto (código, tipo+valor, categoría, estado).
export function DiscountCodeCard({
  discountCode,
  onSelect,
}: {
  discountCode: DiscountCodeListItem;
  onSelect: () => void;
}) {
  return (
    <Card
      className="flex cursor-pointer flex-col gap-1 rounded-2xl p-4 transition-shadow hover:shadow-md"
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{discountCode.code}</p>
        <Badge variant={discountCode.isActive ? "default" : "outline"} className="text-[10px]">
          {discountCode.isActive ? "activo" : "inactivo"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {discountCode.value} {discountTypeLabels[discountCode.type as keyof typeof discountTypeLabels] ?? discountCode.type}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{discountCode.category ? discountCategoryLabels[discountCode.category] : "sin categoría"}</span>
        {discountCode.expiresAt && <span>expira {formatDate(discountCode.expiresAt)}</span>}
      </div>
    </Card>
  );
}
