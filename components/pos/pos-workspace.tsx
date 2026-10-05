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
  const hasLines = useCartStore((s) => s.lines.length > 0);

  // Recupera el carrito guardado (ver cart-store.ts) y lo descarta si era
  // de otro empleado o de otro turno.
  useEffect(() => {
    const ownerKey = `${employee.id}:${shiftId}`;
    Promise.resolve(useCartStore.persist.rehydrate()).then(() => {
      useCartStore.getState().claimCart(ownerKey);
    });
  }, [employee.id, shiftId]);

  // Aviso del navegador antes de cerrar/recargar con una orden a medias.
  useEffect(() => {
    if (!hasLines) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasLines]);

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
      .catch(() => {
        // La cuenta ya no existe o se cobró en otra caja (p. ej. al
        // recuperar un carrito guardado): se vuelve a una venta normal.
        setActiveTabSummary(null);
        useCartStore.getState().setActiveTabId(null);
      });
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
