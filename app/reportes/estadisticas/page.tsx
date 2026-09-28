import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getStatsReport, resolveDateRange } from "@/lib/reports";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/reportes/date-range-picker";
import { formatCurrency } from "@/lib/utils";

// Mismas etiquetas que components/pos/cart-panel.tsx (no exportadas desde
// ahí, es una const local de ese archivo) — "Mesa" es CONSUMO_LOCAL.
const orderTypeLabels: Record<string, string> = {
  CONSUMO_LOCAL: "Mesa",
  PARA_LLEVAR: "Para llevar",
  DOMICILIO: "A domicilio",
};

export default async function ReporteEstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ESTADISTICAS_GESTIONAR"))) {
    redirect("/pos");
  }

  const params = await searchParams;
  const { from, to, fromStr, toStr } = resolveDateRange(params.from, params.to);
  const report = await getStatsReport(from, to);
  const peakHour = report.hourlySales.reduce<(typeof report.hourlySales)[number] | null>(
    (max, h) => (!max || h.salesCount > max.salesCount ? h : max),
    null
  );

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Estadísticas</h1>
            <DateRangePicker from={fromStr} to={toStr} />
          </div>

          <Card>
            <CardContent className="grid grid-cols-4 gap-4 pt-4 text-sm">
              <div>
                <p className="text-muted-foreground">Transacciones</p>
                <p className="text-lg font-semibold">{report.totalSales}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ingresos totales</p>
                <p className="text-lg font-semibold">{formatCurrency(report.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ticket promedio</p>
                <p className="text-lg font-semibold">{formatCurrency(report.averageTicket)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Hora pico</p>
                <p className="text-lg font-semibold">
                  {peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00` : "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Productos más vendidos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {report.topProducts.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
              )}
              {report.topProducts.map((product, index) => (
                <div key={product.productVariantId} className="flex items-center justify-between text-sm">
                  <p>
                    {index + 1}. {product.productName} {product.variantName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {product.quantitySold} vendidos · {formatCurrency(product.revenue)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por día</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {report.dailySales.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
              )}
              {report.dailySales.map((day) => (
                <div key={day.date} className="flex items-center justify-between text-sm">
                  <p>{day.date}</p>
                  <p className="text-xs text-muted-foreground">
                    {day.salesCount} venta{day.salesCount === 1 ? "" : "s"} · {formatCurrency(day.revenue)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por hora del día</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {report.hourlySales.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
              )}
              {report.hourlySales.map((h) => (
                <div key={h.hour} className="flex items-center justify-between text-sm">
                  <p>{String(h.hour).padStart(2, "0")}:00</p>
                  <p className="text-xs text-muted-foreground">
                    {h.salesCount} venta{h.salesCount === 1 ? "" : "s"} · {formatCurrency(h.revenue)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por canal</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {report.channelSales.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
              )}
              {report.channelSales.map((c) => (
                <div key={c.orderType} className="flex items-center justify-between text-sm">
                  <p>{orderTypeLabels[c.orderType] ?? c.orderType}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.salesCount} venta{c.salesCount === 1 ? "" : "s"} · {formatCurrency(c.revenue)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalle de ventas</CardTitle>
            </CardHeader>
            <CardContent className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {report.sales.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
              )}
              {report.sales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between text-sm">
                  <p>{new Date(sale.createdAt).toLocaleString("es-MX")}</p>
                  <p className="text-xs text-muted-foreground">
                    {orderTypeLabels[sale.orderType] ?? sale.orderType} · {formatCurrency(sale.total)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
    </AuthenticatedShell>
  );
}
