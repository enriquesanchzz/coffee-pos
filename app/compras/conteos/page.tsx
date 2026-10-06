import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getPhysicalCounts } from "@/lib/counts";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ComprasLayout } from "@/components/compras/compras-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { physicalCountStatusLabels } from "@/components/compras/enum-labels";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Conteos físicos" };

export default async function ConteosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_CONSULTAR"));
  if (!canManage) redirect("/pos");

  const counts = await getPhysicalCounts();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <ComprasLayout>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <PageHeader level={2} title="Conteos físicos" action={{ href: "/compras/conteos/nuevo", label: "+ Nuevo conteo" }} />

          <Card>
            <CardHeader>
              <CardTitle>Conteos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {counts.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay conteos.</p>
              )}
              {counts.map((count) => (
                <Link
                  key={count.id}
                  href={`/compras/conteos/${count.id}`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <div>
                    <p>{count.performedByName}</p>
                    <p className="text-xs text-muted-foreground">
                      {physicalCountStatusLabels[count.status as keyof typeof physicalCountStatusLabels] ??
                        count.status}{" "}
                      · {count.lineCount} ingrediente{count.lineCount === 1 ? "" : "s"} ·{" "}
                      {formatDate(count.startedAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </ComprasLayout>
    </AuthenticatedShell>
  );
}
