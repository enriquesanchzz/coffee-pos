import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getPhysicalCounts } from "@/lib/counts";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { physicalCountStatusLabels } from "@/components/compras/enum-labels";

export default async function ConteosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_CONSULTAR"));
  if (!canManage) redirect("/pos");

  const counts = await getPhysicalCounts();

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Conteos físicos</h1>
              <Link href="/compras" className="text-sm text-muted-foreground hover:underline">
                ← Compras
              </Link>
            </div>
            <Link
              href="/compras/conteos/nuevo"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Nuevo conteo
            </Link>
          </div>

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
                      {new Date(count.startedAt).toLocaleDateString("es-MX")}
                    </p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
