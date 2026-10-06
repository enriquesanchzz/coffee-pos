import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getDiscountCodes } from "@/lib/discounts";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { DiscountCodesWorkspace } from "@/components/descuentos/discount-codes-workspace";

export const metadata: Metadata = { title: "Códigos de descuento" };

export default async function DescuentosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "DESCUENTO_CODIGO_CREAR"))) {
    redirect("/administracion");
  }

  const codes = await getDiscountCodes();

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <PageHeader title="Códigos de descuento" description="Para clientes específicos, campañas o empleados." />

        <DiscountCodesWorkspace codes={codes} employeeId={employee.id} />
      </div>
    </AuthenticatedShell>
  );
}
