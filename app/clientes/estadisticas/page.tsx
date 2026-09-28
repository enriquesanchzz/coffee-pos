import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getCustomerDemographics } from "@/lib/customers";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EstadisticasClientesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const demographics = await getCustomerDemographics();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Estadísticas de clientes</h1>
          <p className="text-sm text-muted-foreground">
            {demographics.totalCustomers} cliente{demographics.totalCustomers === 1 ? "" : "s"} registrado
            {demographics.totalCustomers === 1 ? "" : "s"}.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Por edad</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {demographics.byAgeBucket.map((row) => (
              <div key={row.bucket} className="flex items-center justify-between text-sm">
                <span>{row.bucket}</span>
                <span className="text-muted-foreground">{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por género</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {demographics.byGender.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span>{row.label}</span>
                <span className="text-muted-foreground">{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AuthenticatedShell>
  );
}
