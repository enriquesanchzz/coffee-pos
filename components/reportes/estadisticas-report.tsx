import type { StatsReport } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "./date-range-picker";
import { formatCurrency, pluralize } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";

// Mismas etiquetas que components/pos/cart-panel.tsx (no exportadas desde
// ahí, es una const local de ese archivo) — "Mesa" es CONSUMO_LOCAL.
const orderTypeLabels: Record<string, string> = {
  CONSUMO_LOCAL: "Mesa",
  PARA_LLEVAR: "Para llevar",
  DOMICILIO: "A domicilio",
};

export function EstadisticasReport({
  report,
  fromStr,
  toStr,
}: {
  report: StatsReport;
  fromStr: string;
  toStr: string;
}) {
  const peakHour = report.hourlySales.reduce<(typeof report.hourlySales)[number] | null>(
    (max, h) => (!max || h.salesCount > max.salesCount ? h : max),
    null
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Estadísticas</h2>
        <DateRangePicker from={fromStr} to={toStr} view="estadisticas" />
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4 pt-4 text-sm">
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
            <p className="text-lg font-semibold">{peakHour ? `${String(peakHour.hour).padStart(2, "0")}:00` : "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h3">Productos más vendidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.topProducts.length === 0 && <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>}
          {report.topProducts.map((product, index) => (
            <div key={product.productVariantId} className="flex items-center justify-between text-sm">
              <p>
                {index + 1}. {product.productName} {product.variantName}
              </p>
              <p className="text-xs text-muted-foreground">
                {pluralize(product.quantitySold, "vendido")} · {formatCurrency(product.revenue)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h3">Ventas por día</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.dailySales.length === 0 && <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>}
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
          <CardTitle as="h3">Ventas por hora del día</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.hourlySales.length === 0 && <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>}
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
          <CardTitle as="h3">Ventas por canal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.channelSales.length === 0 && <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>}
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
          <CardTitle as="h3">Detalle de ventas</CardTitle>
        </CardHeader>
        <CardContent className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {report.sales.length === 0 && <p className="text-sm text-muted-foreground">No hay ventas en este periodo.</p>}
          {report.sales.map((sale) => (
            <div key={sale.id} className="flex items-center justify-between text-sm">
              <p>{formatDateTime(sale.createdAt)}</p>
              <p className="text-xs text-muted-foreground">
                {orderTypeLabels[sale.orderType] ?? sale.orderType} · {formatCurrency(sale.total)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
