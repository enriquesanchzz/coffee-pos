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
import { sectionColumnClass, sectionPillClass } from "@/components/layout/section-nav";
import { matchesSearch } from "@/lib/search";

type StatusFilter = "todos" | DiscountCodeStatus;
type CategoryFilter = "todas" | DiscountCodeCategory;

// Filtros en memoria sobre la lista ya cargada (búsqueda + estado +
// categoría) — no hace falta volver a pegarle al servidor por cada
// cambio de filtro, mismo criterio que otros workspaces de Administración.
export function DiscountCodesWorkspace({ codes, employeeId }: { codes: DiscountCodeListItem[]; employeeId: string }) {
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

  const categoryEntries: { value: CategoryFilter; label: string }[] = [
    { value: "todas", label: "Todas" },
    ...Object.entries(discountCategoryLabels).map(([value, label]) => ({ value: value as CategoryFilter, label })),
  ];

  // Mismo esquema que Inventario/Productos/POS: encabezado arriba, columna
  // de categorías a la izquierda y contenido a la derecha.
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Códigos de descuento</h1>
          <p className="text-sm text-muted-foreground">Para clientes específicos, campañas o empleados.</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          + Nuevo código
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Categorías de código" className={sectionColumnClass}>
          {categoryEntries.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={categoryFilter === entry.value}
              onClick={() => setCategoryFilter(entry.value)}
              className={sectionPillClass(categoryFilter === entry.value)}
            >
              <span className="min-w-0 break-words leading-snug">{entry.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-2 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar código…"
              aria-label="Buscar código"
              className="max-w-xs rounded-full"
            />
            <Select
              aria-label="Filtrar por estado"
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
              <DiscountCodeCard
                key={discountCode.id}
                discountCode={discountCode}
                onSelect={() => openEdit(discountCode)}
              />
            ))}
          </div>
        </div>
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
