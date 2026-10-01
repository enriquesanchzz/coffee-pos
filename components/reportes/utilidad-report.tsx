import type { ProfitReport } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "./date-range-picker";
import { formatCurrency } from "@/lib/utils";

export function UtilidadReport({ report, fromStr, toStr }: { report: ProfitReport; fromStr: string; toStr: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Utilidad</h2>
        <DateRangePicker from={fromStr} to={toStr} view="utilidad" />
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
          {report.lines.length === 0 && <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>}
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
  );
}
