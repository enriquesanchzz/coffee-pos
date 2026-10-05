"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiscountCodeCategory } from "@prisma/client";
import type { DiscountCodeListItem, DiscountCodeStatus } from "@/lib/discounts";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DiscountCodeCard } from "./discount-code-card";
import { DiscountCodeFormDialog } from "./discount-code-form-dialog";
import { discountCategoryLabels } from "./enum-labels";
import { matchesSearch } from "@/lib/search";

type StatusFilter = "todos" | DiscountCodeStatus;
type CategoryFilter = "todas" | DiscountCodeCategory;

// Filtros en memoria sobre la lista ya cargada (búsqueda + estado +
// categoría) — no hace falta volver a pegarle al servidor por cada
// cambio de filtro, mismo criterio que otros workspaces de Administración.
export function DiscountCodesWorkspace({
  codes,
  employeeId,
}: {
  codes: DiscountCodeListItem[];
  employeeId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<DiscountCodeListItem | null>(null);

  const filtered = useMemo(() => {
    const trimmedQuery = query.trim();
    return codes.filter((discountCode) => {
      if (trimmedQuery && !matchesSearch(trimmedQuery, discountCode.code, discountCode.customerName)) return false;
      if (statusFilter !== "todos" && discountCode.status !== statusFilter) return false;
      if (categoryFilter !== "todas" && discountCode.category !== categoryFilter) return false;
      return true;
    });
  }, [codes, query, statusFilter, categoryFilter]);

  function openCreate() {
    setSelected(null);
    setDialogOpen(true);
  }

  function openEdit(discountCode: DiscountCodeListItem) {
    setSelected(discountCode);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar código…"
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="w-40"
        >
          <option value="todos">Todos</option>
          <option value="ACTIVO">Activos</option>
          <option value="USADO">Usados</option>
          <option value="VENCIDO">Vencidos</option>
          <option value="INACTIVO">Inactivos</option>
        </Select>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
          className="w-48"
        >
          <option value="todas">Todas las categorías</option>
          {Object.entries(discountCategoryLabels).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Button onClick={openCreate} className="ml-auto">
          + Nuevo código
        </Button>
      </div>

      {filtered.length === 0 &&
        (codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay códigos de descuento. Los cupones de bienvenida se crean solos al registrar un cliente.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ningún código coincide con los filtros.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setQuery("");
                setStatusFilter("todos");
                setCategoryFilter("todas");
              }}
            >
              Limpiar filtros
            </button>
          </p>
        ))}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((discountCode) => (
          <DiscountCodeCard key={discountCode.id} discountCode={discountCode} onSelect={() => openEdit(discountCode)} />
        ))}
      </div>

      <DiscountCodeFormDialog
        open={dialogOpen}
        discountCode={selected}
        employeeId={employeeId}
        onOpenChange={setDialogOpen}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
