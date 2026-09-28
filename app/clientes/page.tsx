import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCustomers } from "@/lib/customers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ClientesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const customers = await getCustomers();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Clientes</h1>
            <div className="flex gap-3">
              <Link href="/clientes/descuentos" className="text-sm text-muted-foreground hover:underline">
                Códigos de descuento →
              </Link>
              <Link href="/clientes/estadisticas" className="text-sm text-muted-foreground hover:underline">
                Estadísticas →
              </Link>
            </div>
          </div>
          <Link
            href="/clientes/nuevo"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Nuevo cliente
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {customers.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay clientes.</p>
            )}
            {customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/clientes/${customer.id}`}
                className="flex items-center justify-between text-sm hover:underline"
              >
                <div>
                  <p>{customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {customer.phone ?? customer.email ?? "sin contacto"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {customer.stamps} sello{customer.stamps === 1 ? "" : "s"}
                  {customer.tierName && ` · ${customer.tierName}`}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
