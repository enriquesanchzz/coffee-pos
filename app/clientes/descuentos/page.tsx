import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getDiscountCodes } from "@/lib/discounts";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DiscountCodeToggle } from "@/components/clientes/discount-code-toggle";

const discountTypeLabels: Record<string, string> = {
  PORCENTAJE: "%",
  MONTO_FIJO: "monto fijo",
  PRECIO_FINAL: "precio final",
};

export default async function DescuentosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "DESCUENTO_CODIGO_CREAR"))) {
    redirect("/clientes");
  }

  const codes = await getDiscountCodes();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Códigos de descuento</h1>
              <Link href="/clientes" className="text-sm text-muted-foreground hover:underline">
                ← Clientes
              </Link>
            </div>
            <Link
              href="/clientes/descuentos/nuevo"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Nuevo código
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Códigos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {codes.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay códigos.</p>
              )}
              {codes.map((discountCode) => (
                <div key={discountCode.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="flex items-center gap-2">
                      {discountCode.code}
                      {!discountCode.isActive && (
                        <Badge variant="outline" className="text-[10px]">
                          inactivo
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {discountCode.value} {discountTypeLabels[discountCode.type] ?? discountCode.type}
                      {discountCode.expiresAt &&
                        ` · expira ${new Date(discountCode.expiresAt).toLocaleDateString("es-MX")}`}
                    </p>
                  </div>
                  <DiscountCodeToggle
                    employeeId={employee.id}
                    discountCodeId={discountCode.id}
                    isActive={discountCode.isActive}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
    </AuthenticatedShell>
  );
}
