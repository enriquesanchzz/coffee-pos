import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePasswordSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getEmployees } from "@/lib/employees";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/actions/session";

export default async function AdministracionPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");

  const canManage =
    (await hasPermission(actor.id, DEFAULT_BRANCH_ID, "EMPLEADO_CREAR")) ||
    (await hasPermission(actor.id, DEFAULT_BRANCH_ID, "EMPLEADO_MODIFICAR"));
  if (!canManage) redirect("/pos");

  const employees = await getEmployees();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Administración</h1>
              <p className="text-sm text-muted-foreground">Empleados, roles y acceso.</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/administracion/nuevo"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                + Nuevo empleado
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="text-sm text-muted-foreground hover:underline">
                  Cambiar de empleado
                </button>
              </form>
            </div>
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
        </div>
      </div>
    </div>
  );
}
