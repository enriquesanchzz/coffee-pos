import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReportesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const [canUtilidad, canInventario, canEstadisticas] = await Promise.all([
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_UTILIDAD_VER"),
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "REPORTE_INVENTARIO_VER"),
    hasPermission(employee.id, DEFAULT_BRANCH_ID, "ESTADISTICAS_GESTIONAR"),
  ]);

  const sections = [
    { href: "/reportes/utilidad", label: "Utilidad", description: "Ingresos, costo y margen por rango de fechas.", enabled: canUtilidad },
    { href: "/reportes/recetas", label: "Recetas", description: "Costo actual vs. precio de cada receta, con su historial.", enabled: canUtilidad },
    { href: "/reportes/inventario", label: "Inventario", description: "Valor de stock actual y movimientos del periodo.", enabled: canInventario },
    { href: "/reportes/estadisticas", label: "Estadísticas", description: "Productos más vendidos, ventas por día, ticket promedio.", enabled: canEstadisticas },
  ];

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
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
    </AuthenticatedShell>
  );
}
