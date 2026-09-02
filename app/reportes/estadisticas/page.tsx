import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getStatsReport, resolveDateRange } from "@/lib/reports";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/reportes/date-range-picker";
import { formatCurrency } from "@/lib/utils";

export default async function ReporteEstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ESTADISTICAS_GESTIONAR"))) {
    redirect("/pos");
  }

  const params = await searchParams;
  const { from, to, fromStr, toStr } = resolveDateRange(params.from, params.to);
  const report = await getStatsReport(from, to);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Estadísticas</h1>
            <DateRangePicker from={fromStr} to={toStr} />
          </div>

          <Card>
            <CardContent className="grid grid-cols-3 gap-4 pt-4 text-sm">
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
                <div
                  key={`${product.productName}-${product.variantName}`}
                  className="flex items-center justify-between text-sm"
                >
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
        </div>
      </div>
    </div>
  );
}
