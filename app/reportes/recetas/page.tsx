import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getRecipeCostReport } from "@/lib/reports";
import { getProductCategories } from "@/lib/recipes";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecipeReportFilters } from "@/components/reportes/recipe-report-filters";
import { temperatureLabels } from "@/components/productos/enum-labels";
import { formatCurrency } from "@/lib/utils";
import type { VariantTemperature } from "@prisma/client";

const VALID_TEMPERATURES = new Set(["CALIENTE", "FRIO", "FRAPPE"]);

export default async function ReporteRecetasPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; temperature?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_UTILIDAD_VER"))) {
    redirect("/pos");
  }

  const params = await searchParams;
  const categoryId = params.category ?? "";
  const temperatureParam = params.temperature ?? "";
  const temperature = VALID_TEMPERATURES.has(temperatureParam)
    ? (temperatureParam as VariantTemperature)
    : undefined;

  const [items, categories] = await Promise.all([
    getRecipeCostReport({ categoryId: categoryId || undefined, temperature }),
    getProductCategories(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold">Costo de recetas</h1>
              <p className="text-sm text-muted-foreground">
                Costo actual calculado con el costo cotizado de cada ingrediente en Compras.
              </p>
            </div>
            <RecipeReportFilters categories={categories} categoryId={categoryId} temperature={temperatureParam} />
          </div>

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay recetas activas con estos filtros.</p>
          )}

          {items.map((item) => (
            <Card key={item.variantId}>
              <CardHeader>
                <CardTitle>
                  {item.productName} {item.variantName}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {item.categoryName}
                  {item.temperature && ` · ${temperatureLabels[item.temperature]}`}
                </p>
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
    </AuthenticatedShell>
  );
}
