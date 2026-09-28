import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getEmployees } from "@/lib/employees";
import { getTargetFoodCostPercent } from "@/lib/recipes";
import { getThemeSettings } from "@/lib/theme";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "@/components/administracion/settings-form";
import { AppearanceForm } from "@/components/administracion/appearance-form";

// Módulos que ahora viven "dentro" de Administración (accesos rápidos desde
// este hub) — las rutas se quedan donde ya estaban, solo se restringe quién
// las ve/puede entrar (ver Sidebar/AuthenticatedShell, gate por rol).
const adminSections = [
  { href: "/clientes", label: "Clientes", description: "Alta, edición, estadísticas y top de compras." },
  { href: "/reportes", label: "Reportes", description: "Utilidad, recetas, inventario y estadísticas." },
  { href: "/compras", label: "Compras", description: "Órdenes de compra y proveedores." },
  { href: "/productos", label: "Productos", description: "Catálogo, recetas y variantes." },
  { href: "/inventario", label: "Inventario", description: "Insumos, categorías y stock." },
];

export default async function AdministracionPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const [employees, targetFoodCostPercent, themeSettings] = await Promise.all([
    getEmployees(),
    getTargetFoodCostPercent(),
    getThemeSettings(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Administración</h1>
            <p className="text-sm text-muted-foreground">Empleados, roles y acceso.</p>
          </div>
          <Link
            href="/administracion/nuevo"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Nuevo empleado
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {adminSections.map((section) => (
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

        <Card>
          <CardHeader>
            <CardTitle>Empleados</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {employees.map((employee) => (
              <div key={employee.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="flex items-center gap-2">
                    {employee.name}
                    {!employee.isActive && (
                      <Badge variant="outline" className="text-[10px]">
                        inactivo
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {employee.roleName ?? "sin rol"}
                    {employee.isCashier && " · cajero"}
                    {employee.hasPassword && " · acceso Administración"}
                  </p>
                </div>
                <Link
                  href={`/administracion/${employee.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  Editar
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm targetFoodCostPercent={targetFoodCostPercent} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Apariencia</CardTitle>
          </CardHeader>
          <CardContent>
            <AppearanceForm initial={themeSettings} />
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
