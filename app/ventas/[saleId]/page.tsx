import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SaleOrderType, SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSaleReceiptDetail } from "@/lib/receipt";
import { getSaleAdminExtras, saleFolio } from "@/lib/sales";
import { PAYMENT_METHOD_LABELS } from "@/lib/settings-shared";
import { formatCurrency } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { VoidSaleButton } from "@/components/ventas/void-sale-button";

export const metadata: Metadata = { title: "Detalle de venta" };

const STATUS_BADGE: Record<SaleStatus, { label: string; variant: "success" | "destructive" | "warning" }> = {
  COMPLETADA: { label: "Cobrada", variant: "success" },
  CANCELADA: { label: "Cancelada", variant: "destructive" },
  ABIERTA: { label: "En espera", variant: "warning" },
};
const ORDER_TYPE_LABELS: Record<SaleOrderType, string> = {
  CONSUMO_LOCAL: "Mesa",
  PARA_LLEVAR: "Para llevar",
  DOMICILIO: "A domicilio",
};

export default async function VentaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const { saleId } = await params;
  const exists = await prisma.sale.findFirst({ where: { id: saleId, branchId: DEFAULT_BRANCH_ID }, select: { id: true } });
  if (!exists) notFound();

  const [sale, extras, voids] = await Promise.all([
    getSaleReceiptDetail(saleId),
    getSaleAdminExtras(saleId),
    // Productos quitados/reducidos de la cuenta antes de cobrar (ver
    // SaleItemVoid y authorizeTabCorrection en actions/pos.ts).
    prisma.saleItemVoid.findMany({
      where: { saleId },
      orderBy: { createdAt: "asc" },
      include: { employee: { select: { name: true } }, authorizedBy: { select: { name: true } } },
    }),
  ]);

  // Regresa al listado con los mismos filtros y página.
  const back = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (value) back.set(key, value);
  const backHref = back.size > 0 ? `/ventas?${back}` : "/ventas";

  const badge = STATUS_BADGE[sale.status];
  const canVoid = extras.shiftOpen && sale.status !== "CANCELADA";
  const ticketHref = sale.status === "ABIERTA" ? `/pos/cuenta/${sale.id}` : `/pos/ticket/${sale.id}`;

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
          ← Volver a ventas
        </Link>
        <PageHeader
          title={`Venta ${saleFolio(sale.id)}`}
          description={`${formatDateTime(sale.createdAt)} · atendió ${sale.employeeName}`}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="text-sm text-muted-foreground">
            {ORDER_TYPE_LABELS[sale.orderType]}
            {sale.tableNumber ? ` ${sale.tableNumber}` : ""}
            {sale.customerName && ` · ${sale.customerName}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={ticketHref} target="_blank" className={buttonVariants({ variant: "outline" })}>
            {sale.status === "ABIERTA" ? "Imprimir pre-cuenta" : "Imprimir ticket"}
          </Link>
          {canVoid && sale.status !== "CANCELADA" && (
            <VoidSaleButton
              sale={{
                id: sale.id,
                status: sale.status,
                createdAt: sale.createdAt.toISOString(),
                orderType: sale.orderType,
                tableNumber: sale.tableNumber,
                total: sale.total,
                tipAmount: sale.tipAmount,
                employeeName: sale.employeeName,
                paymentMethods: sale.payments.map((p) => p.method),
              }}
              branchId={DEFAULT_BRANCH_ID}
              shiftId={extras.shiftId}
              employeeId={employee.id}
            />
          )}
        </div>
        {!extras.shiftOpen && sale.status === "COMPLETADA" && (
          <p className="text-xs text-muted-foreground">
            Esta venta es de un turno ya cerrado: no se puede anular porque el corte ya se entregó.
          </p>
        )}

        {sale.status === "CANCELADA" && (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col gap-1 pt-4 text-sm">
              <p className="font-medium text-destructive">Venta cancelada</p>
              <p>
                {extras.cancelledAt ? formatDateTime(extras.cancelledAt) : "—"}
                {extras.cancelledByName && ` · autorizó ${extras.cancelledByName}`}
              </p>
              {extras.cancelReason && <p className="text-muted-foreground">Motivo: {extras.cancelReason}</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <h2 className="font-medium">Productos</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {sale.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p>
                      {item.quantity} × {item.comboName ? `${item.comboName}: ` : ""}
                      {item.productName}
                      {item.variantName && ` (${item.variantName})`}
                    </p>
                    {(item.modifierNames.length > 0 || item.extraNames.length > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {[...item.modifierNames, ...item.extraNames].join(", ")}
                      </p>
                    )}
                    {item.notes && <p className="text-xs italic text-muted-foreground">{item.notes}</p>}
                  </div>
                  <span className="shrink-0">{formatCurrency(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
              <Row label="Subtotal" value={formatCurrency(extras.subtotal)} />
              {sale.discountTotal > 0 && (
                <Row
                  label={
                    extras.discountCode
                      ? `Descuento (código ${extras.discountCode})`
                      : extras.manualDiscountReason
                        ? `Descuento manual — ${extras.manualDiscountReason}${extras.manualDiscountAuthorizedBy ? `, autorizó ${extras.manualDiscountAuthorizedBy}` : ""}`
                        : "Descuento"
                  }
                  value={`− ${formatCurrency(sale.discountTotal)}`}
                />
              )}
              <Row label="Total" value={formatCurrency(sale.total)} strong />
              {sale.taxAmount > 0 && (
                <p className="text-xs text-muted-foreground">Incluye IVA {formatCurrency(sale.taxAmount)}</p>
              )}
              {sale.tipAmount > 0 && <Row label="Propina" value={formatCurrency(sale.tipAmount)} />}
            </dl>
          </CardContent>
        </Card>

        {voids.length > 0 && (
          <Card className="border-warning/50">
            <CardContent className="flex flex-col gap-2 pt-4 text-sm">
              <h2 className="font-medium">Quitado de la cuenta antes de cobrar</h2>
              <ul className="flex flex-col gap-2">
                {voids.map((v) => (
                  <li key={v.id} className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <p>
                        {v.quantity} × {v.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(v.createdAt)} · {v.employee.name}
                        {v.authorizedBy
                          ? v.authorizedById === v.employeeId
                            ? " (gerente o administrador)"
                            : ` · autorizó ${v.authorizedBy.name}`
                          : " · corrección inmediata"}
                      </p>
                    </div>
                    <span className="shrink-0">− {formatCurrency(v.amount.toNumber())}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {extras.payments.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-2 pt-4 text-sm">
              <h2 className="font-medium">Pagos</h2>
              {extras.payments.map((p, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <span>
                    {PAYMENT_METHOD_LABELS[p.method]}
                    {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
                  </span>
                  <span className="text-right">
                    {formatCurrency(p.amount)}
                    {p.tipAmount > 0 && (
                      <span className="block text-xs text-muted-foreground">incluye {formatCurrency(p.tipAmount)} de propina</span>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AuthenticatedShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 font-semibold" : "flex justify-between gap-4"}>
      <dt>{label}</dt>
      <dd className="shrink-0">{value}</dd>
    </div>
  );
}
