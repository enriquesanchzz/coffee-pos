import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCustomerDetail, getKnownAllergenTags } from "@/lib/customers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "@/components/clientes/customer-form";
import { LoyaltyActions } from "@/components/clientes/loyalty-actions";
import { PetsEditor } from "@/components/clientes/pets-editor";
import { formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { orNotFound } from "@/lib/not-found";

export const metadata: Metadata = { title: "Detalle de cliente" };

const POINTS_REASON_LABELS: Record<string, string> = {
  VENTA: "compra",
  CANCELACION: "venta anulada",
  CONVERSION: "conversión de sellos",
  REINICIO: "reinicio de ciclo",
};

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
  const [customer, allergenTags] = await Promise.all([orNotFound(getCustomerDetail(id)), getKnownAllergenTags()]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
          <h1 className="text-lg font-semibold">{customer.name}</h1>

          <Card>
            <CardHeader>
              <CardTitle>Lealtad</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {customer.loyalty.map((p) => (
                <div key={p.program} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{p.label}</p>
                    <p>
                      <span className="font-semibold">{p.points} pts</span>
                      <span className="text-muted-foreground"> · {p.tier ? `nivel ${p.tier.name}` : "sin nivel"}</span>
                    </p>
                  </div>
                  {p.nextTier && (
                    <>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(100, (p.points / p.nextTier.pointsRequired) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Faltan {p.nextTier.missing} pts para {p.nextTier.name}
                      </p>
                    </>
                  )}
                </div>
              ))}

              {customer.coupons.length > 0 && (
                <div className="flex flex-col gap-1 border-t pt-3">
                  <p className="font-medium">Cupones</p>
                  {customer.coupons.map((c) => (
                    <p key={c.code} className="flex justify-between gap-2">
                      <span>
                        {c.label} <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                      </span>
                      <span className={c.status === "disponible" ? "text-success" : "text-muted-foreground"}>
                        {c.status}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              {customer.pointsHistory.length > 0 && (
                <details className="border-t pt-3">
                  <summary className="cursor-pointer font-medium">Movimientos de puntos</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {customer.pointsHistory.map((e) => (
                      <li key={e.id} className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {formatDateTime(e.createdAt)} · {e.label} · {POINTS_REASON_LABELS[e.reason] ?? e.reason}
                        </span>
                        <span className={e.points < 0 ? "text-destructive" : ""}>
                          {e.points > 0 ? `+${e.points}` : e.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
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

          <Card>
            <CardHeader>
              <CardTitle>Mascotas</CardTitle>
            </CardHeader>
            <CardContent>
              <PetsEditor
                employeeId={employee.id}
                customerId={customer.id}
                pets={customer.pets}
                allergenSuggestions={allergenTags}
              />
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
