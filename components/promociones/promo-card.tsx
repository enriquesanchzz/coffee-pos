"use client";

import type { ComboListItem, PromotionListItem } from "@/lib/promotions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, pluralize } from "@/lib/utils";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function vigenciaText(daysOfWeek: number[], startTime: string | null, endTime: string | null) {
  const days = daysOfWeek.length === 0 ? "Todos los días" : daysOfWeek.map((d) => DAY_LABELS[d]).join(", ");
  const hours = startTime || endTime ? `${startTime ?? "00:00"}–${endTime ?? "23:59"}` : "Todo el día";
  return `${days} · ${hours}`;
}

export type PromoCardItem =
  | { kind: "combo"; combo: ComboListItem }
  | { kind: "promotion"; promotion: PromotionListItem };

export function PromoCard({ item, onSelect }: { item: PromoCardItem; onSelect: () => void }) {
  if (item.kind === "combo") {
    const combo = item.combo;
    return (
      <Card className="flex cursor-pointer flex-col gap-1 rounded-2xl p-4 transition-shadow hover:shadow-md" onClick={onSelect}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">{combo.name}</p>
          <Badge variant={combo.isActive ? "default" : "outline"} className="text-[10px]">
            {combo.isActive ? "activo" : "inactivo"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{formatCurrency(combo.price)} · {pluralize(combo.items.length, "producto")}</p>
        <p className="text-xs text-muted-foreground">Paquete · {vigenciaText(combo.daysOfWeek, combo.startTime, combo.endTime)}</p>
      </Card>
    );
  }

  const promotion = item.promotion;
  const subtitle =
    promotion.category === "DOS_POR_UNO"
      ? `${promotion.variants.length} producto${promotion.variants.length === 1 ? "" : "s"}`
      : `${promotion.discountValue}${promotion.discountType === "PORCENTAJE" ? "%" : ""} de descuento`;

  return (
    <Card className="flex cursor-pointer flex-col gap-1 rounded-2xl p-4 transition-shadow hover:shadow-md" onClick={onSelect}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{promotion.name}</p>
        <Badge variant={promotion.isActive ? "default" : "outline"} className="text-[10px]">
          {promotion.isActive ? "activo" : "inactivo"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      <p className="text-xs text-muted-foreground">
        {promotion.category === "DOS_POR_UNO" ? "2x1" : "Día temático"} ·{" "}
        {vigenciaText(promotion.daysOfWeek, promotion.startTime, promotion.endTime)}
      </p>
    </Card>
  );
}
