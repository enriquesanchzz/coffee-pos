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
import { getTabDetail, type OpenTabDetail } from "@/actions/pos";
import { CashMovementDialog } from "@/components/caja/cash-movement-dialog";

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

  // Teclas 1–8 abren un favorito sin usar el mouse. Se ignoran mientras el
  // foco está en un campo de texto o hay un diálogo abierto, para no
  // interferir al teclear un número en búsqueda, cantidad o pago.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (productDialogOpen || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (!/^[1-8]$/.test(event.key)) return;
      const product = favoriteProducts[Number(event.key) - 1];
      if (!product) return;
      event.preventDefault();
      setSelectedProduct(product);
      setProductDialogOpen(true);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [favoriteProducts, productDialogOpen]);

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
    <div className="grid h-full grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex items-center justify-end gap-4 border-b border-border px-5 py-3">
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
