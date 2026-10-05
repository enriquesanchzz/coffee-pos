"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogCategory, CatalogProduct, ExtraIngredientOption } from "@/lib/catalog";
import type { CustomerOption } from "@/lib/customers";
import { CatalogBrowser } from "./catalog-browser";
import { CartPanel } from "./cart-panel";
import { ProductDialog } from "./product-dialog";
import { FavoritesBar } from "./favorites-bar";
import { OpenTabsDialog } from "./open-tabs-dialog";
import { useCartStore } from "./cart-store";
import { getTabDetail as getTabDetailAction, type OpenTabDetail } from "@/actions/pos";
import { CashMovementDialog } from "@/components/caja/cash-movement-dialog";
import { withActionErrors } from "@/lib/action-result";

// Ver lib/action-result.ts: convierte {__actionError} de vuelta en Error.
const getTabDetail = withActionErrors(getTabDetailAction);

export function PosWorkspace({
  catalog,
  branchId,
  shiftId,
  employee,
  customers,
  extraIngredientOptions,
  favoriteProductIds,
}: {
  catalog: CatalogCategory[];
  branchId: string;
  shiftId: string;
  employee: { id: string; name: string };
  customers: CustomerOption[];
  extraIngredientOptions: ExtraIngredientOption[];
  favoriteProductIds: string[];
}) {
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [openTabsDialogOpen, setOpenTabsDialogOpen] = useState(false);
  const [activeTabSummary, setActiveTabSummary] = useState<OpenTabDetail | null>(null);
  const addLine = useCartStore((s) => s.addLine);
  const activeTabId = useCartStore((s) => s.activeTabId);

  const favoriteProducts = useMemo(() => {
    const byId = new Map(catalog.flatMap((c) => c.products).map((p) => [p.id, p]));
    return favoriteProductIds.map((id) => byId.get(id)).filter((p): p is CatalogProduct => Boolean(p));
  }, [catalog, favoriteProductIds]);

  // Cuenta abierta retomada (ver open-tabs-dialog.tsx) — se recarga su
  // resumen cada vez que cambia el id activo, o después de agregarle una
  // ronda (onTabChanged en CartPanel llama refreshActiveTab de nuevo).
  useEffect(() => {
    if (!activeTabId) {
      setActiveTabSummary(null);
      return;
    }
    getTabDetail(activeTabId)
      .then(setActiveTabSummary)
      .catch(() => setActiveTabSummary(null));
  }, [activeTabId]);

  return (
    // Celular: catálogo arriba y cuenta abajo. Tablet: cuenta a 320px.
    // Escritorio: 360px (el drawer de ProductDialog se alinea a ese ancho).
    <div className="grid h-full grid-rows-[minmax(0,1fr)_minmax(0,45%)] md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex items-center justify-end gap-4 border-b border-border px-3 py-2 sm:px-5 sm:py-3">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline"
            onClick={() => setOpenTabsDialogOpen(true)}
          >
            Cuentas abiertas
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:underline"
            onClick={() => setMovementOpen(true)}
          >
            Movimiento de caja
          </button>
        </div>
        <FavoritesBar
          products={favoriteProducts}
          onSelectProduct={(product) => {
            setSelectedProduct(product);
            setProductDialogOpen(true);
          }}
        />
        <div className="flex-1 overflow-hidden">
          <CatalogBrowser
            catalog={catalog}
            onSelectProduct={(product) => {
              setSelectedProduct(product);
              setProductDialogOpen(true);
            }}
          />
        </div>
      </div>

      <CartPanel
        branchId={branchId}
        shiftId={shiftId}
        employeeId={employee.id}
        customers={customers}
        activeTabSummary={activeTabSummary}
        onTabChanged={() => {
          if (activeTabId) {
            getTabDetail(activeTabId).then(setActiveTabSummary).catch(() => setActiveTabSummary(null));
          }
        }}
      />

      <ProductDialog
        product={selectedProduct}
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        extraIngredientOptions={extraIngredientOptions}
        onAdd={addLine}
      />

      <OpenTabsDialog open={openTabsDialogOpen} onOpenChange={setOpenTabsDialogOpen} branchId={branchId} />

      <CashMovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        shiftId={shiftId}
        employeeId={employee.id}
      />
    </div>
  );
}
