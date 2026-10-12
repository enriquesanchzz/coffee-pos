"use client";

import type { DiscountCodeListItem, DiscountCodeStatus } from "@/lib/discounts";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { discountCategoryLabels } from "./enum-labels";
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
  const { label, variant } = STATUS_BADGE[discountCode.status];
  return (
    <Card
      className="flex min-w-0 cursor-pointer flex-col gap-1 rounded-2xl p-4 transition-shadow hover:shadow-md"
      onClick={onSelect}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 break-all font-semibold" title={discountCode.code}>
          {discountCode.code}
        </p>
        <Badge variant={variant} className="flex-shrink-0 text-[10px]">
          {label}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{describeValue(discountCode.type, discountCode.value)}</p>
      {discountCode.customerName && (
        <p className="break-words text-xs text-muted-foreground">Cupón de: {discountCode.customerName}</p>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{discountCode.category ? discountCategoryLabels[discountCode.category] : "Sin categoría"}</span>
        {discountCode.expiresAt && (
          <span>
            {discountCode.status === "VENCIDO" ? "venció" : "expira"} {formatDate(discountCode.expiresAt)}
          </span>
        )}
      </div>
    </Card>
  );
}

const STATUS_BADGE: Record<DiscountCodeStatus, { label: string; variant: "default" | "outline" | "destructive" }> = {
  ACTIVO: { label: "Activo", variant: "default" },
  USADO: { label: "Usado", variant: "outline" },
  VENCIDO: { label: "Vencido", variant: "destructive" },
  INACTIVO: { label: "Inactivo", variant: "outline" },
};

// "10 %", "$50.00 de descuento", "Precio final $35.00" — antes se leía
// "10 % porcentaje" o "100000 monto fijo" sin formato de moneda.
function describeValue(type: string, value: number) {
  if (type === "PORCENTAJE") return `${value} % de descuento`;
  if (type === "MONTO_FIJO") return `${formatCurrency(value)} de descuento`;
  return `Precio final ${formatCurrency(value)}`;
}
