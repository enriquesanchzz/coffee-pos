import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getInventoryReport, resolveDateRange } from "@/lib/reports";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/reportes/date-range-picker";
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

export default async function ReporteInventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_INVENTARIO_VER"))) {
    redirect("/pos");
  }

  const params = await searchParams;
  const { from, to, fromStr, toStr } = resolveDateRange(params.from, params.to);
  const report = await getInventoryReport(from, to);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Inventario</h1>
            <DateRangePicker from={fromStr} to={toStr} />
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
                    {movement.count} movimiento{movement.count === 1 ? "" : "s"} · cantidad neta{" "}
                    {movement.totalQuantity}
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
