import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReportesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const [canUtilidad, canInventario, canEstadisticas] = await Promise.all([
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_UTILIDAD_VER"),
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_INVENTARIO_VER"),
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "ESTADISTICAS_GESTIONAR"),
  ]);

  if (!canUtilidad && !canInventario && !canEstadisticas) redirect("/pos");

  const sections = [
    { href: "/reportes/utilidad", label: "Utilidad", description: "Ingresos, costo y margen por rango de fechas.", enabled: canUtilidad },
    { href: "/reportes/recetas", label: "Recetas", description: "Costo actual vs. precio de cada receta, con su historial.", enabled: canUtilidad },
    { href: "/reportes/inventario", label: "Inventario", description: "Valor de stock actual y movimientos del periodo.", enabled: canInventario },
    { href: "/reportes/estadisticas", label: "Estadísticas", description: "Productos más vendidos, ventas por día, ticket promedio.", enabled: canEstadisticas },
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">Reportes</h1>
            <p className="text-sm text-muted-foreground">Business intelligence de la sucursal.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {sections
              .filter((section) => section.enabled)
              .map((section) => (
                <Link key={section.href} href={section.href}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle>{section.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{section.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
