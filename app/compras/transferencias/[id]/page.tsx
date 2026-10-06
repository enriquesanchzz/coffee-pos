import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getTransferManifestDetail } from "@/lib/transfers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferStatusActions } from "@/components/compras/transfer-status-actions";
import { ReceiveTransferForm } from "@/components/compras/receive-transfer-form";
import { transferStatusLabels, unitLabels } from "@/components/compras/enum-labels";
import { formatDateTime } from "@/lib/time";
import { orNotFound } from "@/lib/not-found";

export const metadata: Metadata = { title: "Transferencia" };

export default async function DetalleTransferenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_CONSULTAR"));
  if (!canManage) redirect("/pos");

  const { id } = await params;
  const manifest = await orNotFound(getTransferManifestDetail(id));
  const statusLabel =
    transferStatusLabels[manifest.status as keyof typeof transferStatusLabels] ?? manifest.status;

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">
              {manifest.fromName} → {manifest.toName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {statusLabel} · iniciada por {manifest.initiatedByName} ·{" "}
              {formatDateTime(manifest.sentAt)}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Líneas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {manifest.lines.map((line) => {
                const unitLabel = unitLabels[line.unit as keyof typeof unitLabels] ?? line.unit;
                return (
                  <div
                    key={line.id}
                    className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0"
                  >
                    <div>
                      <p>{line.ingredientName}</p>
                      <p className="text-xs text-muted-foreground">
                        enviado {line.quantity} {unitLabel}
                        {line.receivedQuantity !== null && ` · recibido ${line.receivedQuantity} ${unitLabel}`}
                        {line.discrepancyNote && ` · ${line.discrepancyNote}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {manifest.status === "ENVIADO" && (
            <TransferStatusActions employeeId={employee.id} transferManifestId={manifest.id} />
          )}

          {manifest.status === "EN_TRANSITO" && (
            <ReceiveTransferForm employeeId={employee.id} manifest={manifest} />
          )}
        </div>
    </AuthenticatedShell>
  );
}
