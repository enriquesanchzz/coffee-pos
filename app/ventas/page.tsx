import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { PaymentMethod, SaleOrderType, SaleStatus } from "@prisma/client";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSalesEmployees, getSalesPage, parseSalesParams, type SalesSearchParams } from "@/lib/sales";
import { PAYMENT_METHOD_LABELS } from "@/lib/settings-shared";
import { formatCurrency, pluralize } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ventas" };

const STATUS_OPTIONS: { value: SaleStatus; label: string }[] = [
  { value: "COMPLETADA", label: "Cobradas" },
  { value: "CANCELADA", label: "Canceladas" },
  { value: "ABIERTA", label: "En espera" },
];
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
const METHODS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];

export default async function VentasPage({ searchParams }: { searchParams: Promise<SalesSearchParams> }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const params = await searchParams;
  // `query` conserva los filtros al paginar, al volver del detalle y al exportar.
  const { filters, query } = parseSalesParams(params);
  const { status, method, orderType, q, page } = filters;
  const fromStr = query.get("from")!;
  const toStr = query.get("to")!;

  const [employees, result] = await Promise.all([getSalesEmployees(), getSalesPage(filters)]);
  const { rows, totalRows, pageCount, metrics } = result;

  const pageHref = (p: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(p));
    return `/ventas?${next}`;
  };
  const backQuery = new URLSearchParams(query);
  if (page > 1) backQuery.set("page", String(page));

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageHeader
            title="Ventas"
            description="Todas las ventas del periodo — cobradas, canceladas y en espera — con sus métricas."
          />
          {/* <a> y no <Link>: es una descarga, no una navegación del router. */}
          <a href={`/ventas/exportar?${query}`} download className={buttonVariants({ variant: "outline" })}>
            Exportar CSV
          </a>
        </div>

        <Card>
          <CardContent className="pt-4">
            <form method="get" action="/ventas" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="v-from">Desde</Label>
                <Input id="v-from" type="date" name="from" defaultValue={fromStr} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="v-to">Hasta</Label>
                <Input id="v-to" type="date" name="to" defaultValue={toStr} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="v-status">Estado</Label>
                <Select id="v-status" name="status" defaultValue={status ?? ""}>
                  <option value="">Todas</option>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="v-method">Método de pago</Label>
                <Select id="v-method" name="method" defaultValue={method ?? ""}>
                  <option value="">Todos</option>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="v-employee">Atendió</Label>
                <Select id="v-employee" name="employee" defaultValue={params.employee ?? ""}>
                  <option value="">Todos</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="v-type">Tipo</Label>
                <Select id="v-type" name="orderType" defaultValue={orderType ?? ""}>
                  <option value="">Todos</option>
                  {Object.entries(ORDER_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <Label htmlFor="v-q">Buscar</Label>
                <Input id="v-q" name="q" defaultValue={q ?? ""} placeholder="Folio, cliente o mesa" />
              </div>
              <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-4">
                <Button type="submit">Filtrar</Button>
                <Link href="/ventas" className={buttonVariants({ variant: "outline" })}>
                  Limpiar filtros
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Metric label="Cobrado" value={formatCurrency(metrics.completedTotal)} hint={pluralize(metrics.completedCount, "venta")} />
          <Metric label="Ticket promedio" value={formatCurrency(metrics.averageTicket)} />
          <Metric label="Propinas" value={formatCurrency(metrics.tipsTotal)} hint="no cuentan como venta" />
          <Metric label="Descuentos" value={formatCurrency(metrics.discountTotal)} />
          <Metric
            label="Canceladas"
            value={formatCurrency(metrics.cancelledTotal)}
            hint={pluralize(metrics.cancelledCount, "venta")}
          />
          <Metric label="En espera" value={formatCurrency(metrics.openTotal)} hint={pluralize(metrics.openCount, "cuenta")} />
        </div>
        <Card>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-1 pt-4 text-sm">
            <span className="font-medium">Cobrado por método (incluye propinas):</span>
            {METHODS.map((m) => (
              <span key={m}>
                {PAYMENT_METHOD_LABELS[m]} <span className="font-semibold">{formatCurrency(metrics.byMethod[m])}</span>
              </span>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-1 pt-4">
            <p className="mb-2 text-sm text-muted-foreground">
              {totalRows === 0 ? "Ninguna venta con estos filtros." : `${pluralize(totalRows, "venta")} — página ${page} de ${pageCount}`}
            </p>
            {rows.map((sale) => {
              const badge = STATUS_BADGE[sale.status];
              return (
                <Link
                  key={sale.id}
                  href={`/ventas/${sale.id}?${backQuery}`}
                  className="-mx-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md px-2 py-2.5 text-sm hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="font-mono">{sale.folio}</span>
                      <Badge variant={badge.variant} className="text-[10px]">
                        {badge.label}
                      </Badge>
                      <span className="text-muted-foreground">
                        {ORDER_TYPE_LABELS[sale.orderType]}
                        {sale.tableNumber ? ` ${sale.tableNumber}` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(sale.createdAt)} · {sale.employeeName}
                      {sale.customerName && ` · ${sale.customerName}`} · {pluralize(sale.itemCount, "producto")}
                      {sale.methods.length > 0 && ` · ${sale.methods.map((m) => PAYMENT_METHOD_LABELS[m]).join(" + ")}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={sale.status === "CANCELADA" ? "font-semibold line-through text-muted-foreground" : "font-semibold"}>
                      {formatCurrency(sale.total)}
                    </p>
                    {sale.tipAmount > 0 && (
                      <p className="text-xs text-muted-foreground">+ {formatCurrency(sale.tipAmount)} propina</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {pageCount > 1 && (
          <nav aria-label="Paginación de ventas" className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline" })}>
                ← Anteriores
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Página {page} de {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline" })}>
                Siguientes →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </AuthenticatedShell>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
