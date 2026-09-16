"use client";

import { useEffect, useState } from "react";
import type { CatalogCategory, CatalogProduct, ExtraIngredientOption } from "@/lib/catalog";
import type { CustomerOption } from "@/lib/customers";
import { CatalogBrowser } from "./catalog-browser";
import { CartPanel } from "./cart-panel";
import { ProductDialog } from "./product-dialog";
import { CheckoutDialog } from "./checkout-dialog";
import { OpenTabsDialog } from "./open-tabs-dialog";
import { useCartStore } from "./cart-store";
import { getTabDetail, type OpenTabDetail } from "@/actions/pos";
import { logoutAction } from "@/actions/session";
import { CashMovementDialog } from "@/components/caja/cash-movement-dialog";

export function PosWorkspace({
  catalog,
  branchId,
  shiftId,
  employee,
  customers,
  extraIngredientOptions,
}: {
  catalog: CatalogCategory[];
  branchId: string;
  shiftId: string;
  employee: { id: string; name: string };
  customers: CustomerOption[];
  extraIngredientOptions: ExtraIngredientOption[];
}) {
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [openTabsDialogOpen, setOpenTabsDialogOpen] = useState(false);
  const [activeTabSummary, setActiveTabSummary] = useState<OpenTabDetail | null>(null);
  const addLine = useCartStore((s) => s.addLine);
  const activeTabId = useCartStore((s) => s.activeTabId);

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
    <div className="grid h-full grid-cols-[1fr_360px]">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm text-muted-foreground">
            Atendiendo: <span className="font-semibold text-foreground">{employee.name}</span>
          </p>
          <div className="flex items-center gap-4">
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
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-muted-foreground hover:underline">
                Cambiar de empleado
              </button>
            </form>
          </div>
        </div>
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
        onCheckout={() => setCheckoutOpen(true)}
        branchId={branchId}
        shiftId={shiftId}
        employeeId={employee.id}
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

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        branchId={branchId}
        shiftId={shiftId}
        employeeId={employee.id}
        customers={customers}
        activeTabBaseTotal={activeTabSummary?.total}
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
