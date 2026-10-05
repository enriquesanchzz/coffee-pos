import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getTransferManifests } from "@/lib/transfers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transferStatusLabels } from "@/components/compras/enum-labels";
import { formatDate } from "@/lib/time";

export default async function TransferenciasPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_CONSULTAR"));
  if (!canManage) redirect("/pos");

  const manifests = await getTransferManifests();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Transferencias</h1>
              <Link href="/compras" className="text-sm text-muted-foreground hover:underline">
                ← Compras
              </Link>
            </div>
            <Link
              href="/compras/transferencias/nueva"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Nueva transferencia
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Transferencias</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {manifests.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay transferencias.</p>
              )}
              {manifests.map((manifest) => (
                <Link
                  key={manifest.id}
                  href={`/compras/transferencias/${manifest.id}`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <div>
                    <p>
                      {manifest.fromName} → {manifest.toName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {transferStatusLabels[manifest.status as keyof typeof transferStatusLabels] ??
                        manifest.status}{" "}
                      · {manifest.itemCount} línea{manifest.itemCount === 1 ? "" : "s"} ·{" "}
                      {formatDate(manifest.sentAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
    </AuthenticatedShell>
  );
}
