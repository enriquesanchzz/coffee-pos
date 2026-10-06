import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSuppliers } from "@/lib/purchases";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ComprasNav, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Proveedores" };

export default async function ProveedoresPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "COMPRA_REGISTRAR"));
  if (!canManage) redirect("/pos");

  const suppliers = await getSuppliers();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <PageHeader title="Proveedores" action={{ href: "/compras/proveedores/nuevo", label: "+ Nuevo proveedor" }}>
            <ComprasNav active="/compras/proveedores" />
          </PageHeader>

          <Card>
            <CardHeader>
              <CardTitle>Proveedores</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {suppliers.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay proveedores.</p>
              )}
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="flex items-center gap-2">
                      {supplier.name}
                      {!supplier.isActive && (
                        <Badge variant="outline" className="text-[10px]">
                          inactivo
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {supplier.ingredientCount} ingrediente{supplier.ingredientCount === 1 ? "" : "s"}
                      {supplier.phone && ` · ${supplier.phone}`}
                    </p>
                  </div>
                  <Link
                    href={`/compras/proveedores/${supplier.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Editar
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
    </AuthenticatedShell>
  );
}
