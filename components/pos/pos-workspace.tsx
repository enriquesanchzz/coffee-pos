"use client";

import { useState } from "react";
import type { CatalogCategory, CatalogProduct } from "@/lib/catalog";
import type { CustomerOption } from "@/lib/customers";
import { CatalogBrowser } from "./catalog-browser";
import { CartPanel } from "./cart-panel";
import { ProductDialog } from "./product-dialog";
import { CheckoutDialog } from "./checkout-dialog";
import { useCartStore } from "./cart-store";
import { logoutAction } from "@/actions/session";
import { CashMovementDialog } from "@/components/caja/cash-movement-dialog";

export function PosWorkspace({
  catalog,
  branchId,
  shiftId,
  employee,
  customers,
}: {
  catalog: CatalogCategory[];
  branchId: string;
  shiftId: string;
  employee: { id: string; name: string };
  customers: CustomerOption[];
}) {
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const addLine = useCartStore((s) => s.addLine);

  return (
    <div className="grid h-full grid-cols-[1fr_360px]">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <p className="text-sm text-muted-foreground">
            Atendiendo: <span className="font-medium text-foreground">{employee.name}</span>
          </p>
          <div className="flex items-center gap-4">
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

      <CartPanel onCheckout={() => setCheckoutOpen(true)} />

      <ProductDialog
        product={selectedProduct}
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        onAdd={addLine}
      />

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        branchId={branchId}
        shiftId={shiftId}
        employeeId={employee.id}
        customers={customers}
      />

      <CashMovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        shiftId={shiftId}
        employeeId={employee.id}
      />
    </div>
  );
}
