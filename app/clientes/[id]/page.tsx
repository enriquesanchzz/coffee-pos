import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCustomerDetail } from "@/lib/customers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "@/components/clientes/customer-form";
import { LoyaltyActions } from "@/components/clientes/loyalty-actions";
import { formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { orNotFound } from "@/lib/not-found";

export const metadata: Metadata = { title: "Detalle de cliente" };

export default async function DetalleClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR"))) {
    redirect("/clientes");
  }

  const { id } = await params;
  const customer = await orNotFound(getCustomerDetail(id));

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
          <h1 className="text-lg font-semibold">{customer.name}</h1>

          <Card>
            <CardHeader>
              <CardTitle>Lealtad</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <p>{customer.stamps} de 5 sellos</p>
                <p className="text-muted-foreground">{customer.tierName ?? "sin nivel"}</p>
              </div>
              {customer.welcomeCoupon && (
                <p className="text-muted-foreground">
                  Cupón de bienvenida <span className="font-mono">{customer.welcomeCoupon.code}</span> ·{" "}
                  {customer.welcomeCoupon.used ? "ya usado" : "disponible"}
                </p>
              )}
              {customer.loyaltyCode && (
                <LoyaltyActions
                  phone={customer.phone}
                  loyaltyCode={customer.loyaltyCode}
                  welcomeCouponCode={customer.welcomeCoupon && !customer.welcomeCoupon.used ? customer.welcomeCoupon.code : null}
                />
              )}
            </CardContent>
          </Card>

          <CustomerForm employeeId={employee.id} customer={customer} />

          <Card>
            <CardHeader>
              <CardTitle>Top productos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {customer.topProducts.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin compras completadas todavía.</p>
              )}
              {customer.topProducts.map((item, index) => (
                <div key={item.productVariantId} className="flex items-center justify-between text-sm">
                  <span>
                    {index + 1}. {item.productName} — {item.variantName}
                  </span>
                  <span className="text-muted-foreground">
                    {item.quantityPurchased}×
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial de compras</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {customer.sales.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin compras todavía.</p>
              )}
              {customer.sales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between text-sm">
                  <span>{formatDateTime(sale.createdAt)}</span>
                  <span>{formatCurrency(sale.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
    </AuthenticatedShell>
  );
}
