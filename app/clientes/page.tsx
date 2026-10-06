import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCustomers } from "@/lib/customers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const { items: customers, total, page, pageCount } = await getCustomers({
    query,
    page: Number(params.page) || 1,
  });
  const pageHref = (p: number) => `/clientes?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(p) })}`;

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <PageHeader title="Clientes" action={{ href: "/clientes/nuevo", label: "+ Nuevo cliente" }} />

        <form action="/clientes" role="search" className="flex gap-2">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre, teléfono, email o código de tarjeta…"
            aria-label="Buscar clientes"
          />
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle>
              {query ? `${total} resultado${total === 1 ? "" : "s"} para “${query}”` : `${total} cliente${total === 1 ? "" : "s"}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {customers.length === 0 &&
              (query ? (
                <p className="text-sm text-muted-foreground">
                  Ningún cliente coincide.{" "}
                  <Link href="/clientes" className="underline">
                    Ver todos
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay clientes.{" "}
                  <Link href="/clientes/nuevo" className="underline">
                    Registra el primero
                  </Link>
                </p>
              ))}
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

        {pageCount > 1 && (
          <nav aria-label="Paginación de clientes" className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="underline">
                ← Anteriores
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Página {page} de {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} className="underline">
                Siguientes →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </AuthenticatedShell>
  );
}
