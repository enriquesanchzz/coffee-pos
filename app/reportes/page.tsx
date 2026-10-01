import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import {
  getProfitReport,
  getInventoryReport,
  getRecipeCostReport,
  getStatsReport,
  resolveDateRange,
} from "@/lib/reports";
import { getProductCategories } from "@/lib/recipes";
import { getCustomerDemographics } from "@/lib/customers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ReportesNav, type ReportesView } from "@/components/reportes/reportes-nav";
import { UtilidadReport } from "@/components/reportes/utilidad-report";
import { RecetasReport } from "@/components/reportes/recetas-report";
import { InventarioReport } from "@/components/reportes/inventario-report";
import { EstadisticasReport } from "@/components/reportes/estadisticas-report";
import { ClientesReport } from "@/components/reportes/clientes-report";
import type { VariantTemperature } from "@prisma/client";

const VALID_VIEWS = new Set<ReportesView>(["utilidad", "recetas", "inventario", "estadisticas", "clientes"]);
const VALID_TEMPERATURES = new Set(["CALIENTE", "FRIO", "FRAPPE"]);

// Consolida las 4 rutas sueltas de Reportes (+ Estadísticas de Clientes,
// que se muda aquí) en una sola con submenú a la izquierda — a diferencia
// de Productos/Inventario, cada reporte es una agregación cara con su
// propio rango de fechas, así que solo se hace fetch del reporte activo
// (`view`), no los 5 de una vez.
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string; to?: string; category?: string; temperature?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const [canUtilidad, canInventario, canEstadisticas] = await Promise.all([
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_UTILIDAD_VER"),
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_INVENTARIO_VER"),
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "ESTADISTICAS_GESTIONAR"),
  ]);

  const visible: ReportesView[] = [
    ...(canUtilidad ? (["utilidad", "recetas"] as ReportesView[]) : []),
    ...(canInventario ? (["inventario"] as ReportesView[]) : []),
    ...(canEstadisticas ? (["estadisticas", "clientes"] as ReportesView[]) : []),
  ];

  const params = await searchParams;
  const requestedView = VALID_VIEWS.has(params.view as ReportesView) ? (params.view as ReportesView) : visible[0];

  if (!requestedView) {
    // Sin ningún permiso de reportes: no hay nada que mostrar.
    redirect("/pos");
  }
  if (!visible.includes(requestedView)) {
    redirect("/pos");
  }

  const { from, to, fromStr, toStr } = resolveDateRange(params.from, params.to);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-4xl gap-6 p-6">
        <ReportesNav active={requestedView} visible={visible} />

        <div className="flex-1">
          {requestedView === "utilidad" && (
            <UtilidadReport report={await getProfitReport(from, to)} fromStr={fromStr} toStr={toStr} />
          )}

          {requestedView === "recetas" && (
            <RecetasReportSection categoryParam={params.category} temperatureParam={params.temperature} />
          )}

          {requestedView === "inventario" && (
            <InventarioReport report={await getInventoryReport(from, to)} fromStr={fromStr} toStr={toStr} />
          )}

          {requestedView === "estadisticas" && (
            <EstadisticasReport report={await getStatsReport(from, to)} fromStr={fromStr} toStr={toStr} />
          )}

          {requestedView === "clientes" && <ClientesReport demographics={await getCustomerDemographics()} />}
        </div>
      </div>
    </AuthenticatedShell>
  );
}

async function RecetasReportSection({
  categoryParam,
  temperatureParam,
}: {
  categoryParam?: string;
  temperatureParam?: string;
}) {
  const categoryId = categoryParam ?? "";
  const temperature = VALID_TEMPERATURES.has(temperatureParam ?? "")
    ? (temperatureParam as VariantTemperature)
    : undefined;

  const [items, categories] = await Promise.all([
    getRecipeCostReport({ categoryId: categoryId || undefined, temperature }),
    getProductCategories(),
  ]);

  return <RecetasReport items={items} categories={categories} categoryId={categoryId} temperature={temperatureParam ?? ""} />;
}
