import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getEmployees } from "@/lib/employees";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Empleados" };

export default async function EmpleadosPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const employees = await getEmployees();

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <PageHeader
          title="Empleados"
          description="Roles y acceso."
          action={{ href: "/empleados/nuevo", label: "+ Nuevo empleado" }}
        />

        <Card>
          <CardHeader>
            <CardTitle>Empleados</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {employees.map((employee) => (
              // Toda la fila es el link (antes solo "Editar", un objetivo
              // de 24px) — mismo patrón que la lista de Clientes.
              <Link
                key={employee.id}
                href={`/empleados/${employee.id}`}
                className="-mx-2 flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted"
              >
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
                    {/* Solo ADMINISTRADOR entra a Administración (QA-021). */}
                    {employee.hasPassword && employee.roleName === "ADMINISTRADOR" && " · acceso Administración"}
                  </p>
                </div>
                <span className="text-sm text-primary" aria-hidden="true">
                  Editar →
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
