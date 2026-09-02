import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getRecipeCostReport } from "@/lib/reports";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export default async function ReporteRecetasPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_UTILIDAD_VER"))) {
    redirect("/pos");
  }

  const items = await getRecipeCostReport();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">Costo de recetas</h1>
            <p className="text-sm text-muted-foreground">
              Costo actual calculado con el costo cotizado de cada ingrediente en Compras.
            </p>
          </div>

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay recetas activas todavía.</p>
          )}

          {items.map((item) => (
            <Card key={item.variantId}>
              <CardHeader>
                <CardTitle>
                  {item.productName} {item.variantName}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Precio</p>
                    <p className="font-medium">{formatCurrency(item.price)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Costo actual</p>
                    <p className="font-medium">{formatCurrency(item.currentCost)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Margen</p>
                    <p className="font-medium">{formatCurrency(item.margin)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Margen %</p>
                    <p className="font-medium">{item.marginPct.toFixed(1)}%</p>
                  </div>
                </div>

                {item.history.length > 0 && (
                  <div className="flex flex-col gap-1 border-t border-border pt-2">
                    <p className="text-xs font-medium text-muted-foreground">Historial de costo</p>
                    {item.history.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between text-xs">
                        <span>{new Date(entry.recordedAt).toLocaleString("es-MX")}</span>
                        <span className="text-muted-foreground">{entry.reason}</span>
                        <span>{formatCurrency(entry.totalCost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
