import type { InventoryReport } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "./date-range-picker";
import { formatCurrency } from "@/lib/utils";

const movementTypeLabels: Record<string, string> = {
  VENTA: "Venta",
  COMPRA: "Compra",
  TRANSFERENCIA_ENTRADA: "Transferencia (entrada)",
  TRANSFERENCIA_SALIDA: "Transferencia (salida)",
  MERMA: "Merma",
  AJUSTE_MANUAL: "Ajuste manual",
  MUESTRA_GRATIS: "Muestra gratis",
  CONTEO_FISICO_AJUSTE: "Ajuste por conteo físico",
};

export function InventarioReport({
  report,
  fromStr,
  toStr,
}: {
  report: InventoryReport;
  fromStr: string;
  toStr: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Inventario</h2>
        <DateRangePicker from={fromStr} to={toStr} view="inventario" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Valor de stock actual — {formatCurrency(report.totalValue)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.items.map((item) => (
            <div key={item.ingredientId} className="flex items-center justify-between text-sm">
              <p>{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.quantity} × {formatCurrency(item.unitCost)} ={" "}
                <span className="font-medium text-foreground">{formatCurrency(item.value)}</span>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos del periodo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.movementSummary.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin movimientos en este periodo.</p>
          )}
          {report.movementSummary.map((movement) => (
            <div key={movement.type} className="flex items-center justify-between text-sm">
              <p>{movementTypeLabels[movement.type] ?? movement.type}</p>
              <p className="text-xs text-muted-foreground">
                {movement.count} movimiento{movement.count === 1 ? "" : "s"} · cantidad neta {movement.totalQuantity}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
