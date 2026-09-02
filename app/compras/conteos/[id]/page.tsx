import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getPhysicalCountDetail } from "@/lib/counts";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApproveCountForm } from "@/components/compras/approve-count-form";
import { physicalCountStatusLabels, unitLabels } from "@/components/compras/enum-labels";

export default async function DetalleConteoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const canManage =
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR")) ||
    (await hasPermission(employee.id, DEFAULT_BRANCH_ID, "INVENTARIO_CONSULTAR"));
  if (!canManage) redirect("/pos");

  const { id } = await params;
  const count = await getPhysicalCountDetail(id);
  const statusLabel =
    physicalCountStatusLabels[count.status as keyof typeof physicalCountStatusLabels] ?? count.status;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">Conteo — {count.performedByName}</h1>
            <p className="text-sm text-muted-foreground">
              {statusLabel} · {new Date(count.startedAt).toLocaleString("es-MX")}
              {count.approvedByName && ` · resuelto por ${count.approvedByName}`}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Líneas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {count.lines.map((line) => {
                const unitLabel = unitLabels[line.unit as keyof typeof unitLabels] ?? line.unit;
                const diff = line.physicalQty - line.theoreticalQty;
                return (
                  <div
                    key={line.id}
                    className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0"
                  >
                    <p>{line.ingredientName}</p>
                    <p className="text-xs text-muted-foreground">
                      teórico {line.theoreticalQty} {unitLabel} · físico {line.physicalQty} {unitLabel}
                      {diff !== 0 && ` · diferencia ${diff > 0 ? "+" : ""}${diff}`}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {count.status === "PENDIENTE_APROBACION" && <ApproveCountForm physicalCountId={count.id} />}
        </div>
      </div>
    </div>
  );
}
