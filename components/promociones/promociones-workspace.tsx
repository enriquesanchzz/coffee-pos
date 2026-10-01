"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComboListItem, PromotionListItem, VariantOption } from "@/lib/promotions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PromoCard, type PromoCardItem } from "./promo-card";
import { ComboFormDialog } from "./combo-form-dialog";
import { PromotionFormDialog } from "./promotion-form-dialog";

type StatusFilter = "todos" | "activo" | "inactivo";
type CategoryFilter = "todas" | "PAQUETE" | "DOS_POR_UNO" | "DIA_TEMATICO";

const CATEGORY_LABELS: Record<Exclude<CategoryFilter, "todas">, string> = {
  PAQUETE: "Paquetes precio reducido",
  DOS_POR_UNO: "2x1",
  DIA_TEMATICO: "Día temático",
};

// Mismo patrón de filtros en memoria que DiscountCodesWorkspace — Combo y
// Promotion son dos modelos distintos en el schema (Paquetes revive
// Combo/ComboItem, que ya existían; 2x1/Día temático son Promotion,
// nuevo), pero en esta pantalla se muestran unificados como un solo tipo
// de tarjeta por categoría.
export function PromocionesWorkspace({
  combos,
  promotions,
  variants,
  employeeId,
}: {
  combos: ComboListItem[];
  promotions: PromotionListItem[];
  variants: VariantOption[];
  employeeId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todas");

  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<ComboListItem | null>(null);

  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [promotionDialogCategory, setPromotionDialogCategory] = useState<"DOS_POR_UNO" | "DIA_TEMATICO">("DOS_POR_UNO");
  const [selectedPromotion, setSelectedPromotion] = useState<PromotionListItem | null>(null);

  const items: PromoCardItem[] = useMemo(
    () => [
      ...combos.map((combo): PromoCardItem => ({ kind: "combo", combo })),
      ...promotions.map((promotion): PromoCardItem => ({ kind: "promotion", promotion })),
    ],
    [combos, promotions]
  );

  const filtered = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const name = item.kind === "combo" ? item.combo.name : item.promotion.name;
      const isActive = item.kind === "combo" ? item.combo.isActive : item.promotion.isActive;
      const category: CategoryFilter = item.kind === "combo" ? "PAQUETE" : item.promotion.category;

      if (trimmedQuery && !name.toLowerCase().includes(trimmedQuery)) return false;
      if (statusFilter === "activo" && !isActive) return false;
      if (statusFilter === "inactivo" && isActive) return false;
      if (categoryFilter !== "todas" && category !== categoryFilter) return false;
      return true;
    });
  }, [items, query, statusFilter, categoryFilter]);

  function openItem(item: PromoCardItem) {
    if (item.kind === "combo") {
      setSelectedCombo(item.combo);
      setComboDialogOpen(true);
    } else {
      setSelectedPromotion(item.promotion);
      setPromotionDialogCategory(item.promotion.category as "DOS_POR_UNO" | "DIA_TEMATICO");
      setPromotionDialogOpen(true);
    }
  }

  function openNewCombo() {
    setSelectedCombo(null);
    setComboDialogOpen(true);
  }

  function openNewPromotion(category: "DOS_POR_UNO" | "DIA_TEMATICO") {
    setSelectedPromotion(null);
    setPromotionDialogCategory(category);
    setPromotionDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar promoción…" className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-40">
          <option value="todos">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)} className="w-56">
          <option value="todas">Todas las categorías</option>
          {Object.entries(CATEGORY_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={openNewCombo}>
            + Paquete
          </Button>
          <Button variant="outline" onClick={() => openNewPromotion("DOS_POR_UNO")}>
            + 2x1
          </Button>
          <Button variant="outline" onClick={() => openNewPromotion("DIA_TEMATICO")}>
            + Día temático
          </Button>
        </div>
      </div>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">Ninguna promoción coincide con los filtros.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <PromoCard key={item.kind === "combo" ? `combo-${item.combo.id}` : `promo-${item.promotion.id}`} item={item} onSelect={() => openItem(item)} />
        ))}
      </div>

      <ComboFormDialog
        open={comboDialogOpen}
        combo={selectedCombo}
        variants={variants}
        employeeId={employeeId}
        onOpenChange={setComboDialogOpen}
        onSaved={() => router.refresh()}
      />

      <PromotionFormDialog
        open={promotionDialogOpen}
        promotion={selectedPromotion}
        category={promotionDialogCategory}
        variants={variants}
        employeeId={employeeId}
        onOpenChange={setPromotionDialogOpen}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
