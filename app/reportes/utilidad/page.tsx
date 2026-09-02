import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getProfitReport, resolveDateRange } from "@/lib/reports";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/reportes/date-range-picker";
import { formatCurrency } from "@/lib/utils";

export default async function ReporteUtilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_UTILIDAD_VER"))) {
    redirect("/pos");
  }

  const params = await searchParams;
  const { from, to, fromStr, toStr } = resolveDateRange(params.from, params.to);
  const report = await getProfitReport(from, to);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Utilidad</h1>
            <DateRangePicker from={fromStr} to={toStr} />
          </div>

          <Card>
            <CardContent className="grid grid-cols-4 gap-4 pt-4 text-sm">
              <div>
                <p className="text-muted-foreground">Ingresos</p>
                <p className="text-lg font-semibold">{formatCurrency(report.revenue)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Costo (COGS)</p>
                <p className="text-lg font-semibold">{formatCurrency(report.cogs)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Margen</p>
                <p className="text-lg font-semibold">{formatCurrency(report.margin)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Margen %</p>
                <p className="text-lg font-semibold">{report.marginPct.toFixed(1)}%</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por producto</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {report.lines.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>
              )}
              {report.lines.map((line) => (
                <div
                  key={line.productVariantId}
                  className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0"
                >
                  <div>
                    <p>
                      {line.productName} {line.variantName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {line.quantitySold} vendidos · costo {formatCurrency(line.cogs)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>{formatCurrency(line.margin)}</p>
                    <p className="text-xs text-muted-foreground">{line.marginPct.toFixed(1)}% margen</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
