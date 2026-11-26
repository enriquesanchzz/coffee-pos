import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { getCatalog, getOpenShift, getExtraIngredientOptions } from "@/lib/catalog";
import { getCustomerOptions, getKnownAllergenTags } from "@/lib/customers";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PosWorkspace } from "@/components/pos/pos-workspace";
import { ShiftOpenForm } from "@/components/pos/shift-open-form";

export const metadata: Metadata = { title: "Punto de Venta" };

export default async function PosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  const isAdmin = resolveRoleName(employee, DEFAULT_BRANCH_ID) === "ADMINISTRADOR";

  const [shift, catalog, customers, extraIngredientOptions, allergenTags] = await Promise.all([
    getOpenShift(DEFAULT_BRANCH_ID),
    getCatalog(DEFAULT_BRANCH_ID),
    getCustomerOptions(),
    getExtraIngredientOptions(),
    getKnownAllergenTags(),
  ]);

  return (
    <AuthenticatedShell isAdmin={isAdmin} employeeName={employee.name} contentClassName="overflow-hidden" srTitle="Punto de Venta">
      {shift ? (
        <PosWorkspace
          catalog={catalog}
          branchId={DEFAULT_BRANCH_ID}
          shiftId={shift.id}
          employee={{ id: employee.id, name: employee.name }}
          customers={customers}
          extraIngredientOptions={extraIngredientOptions}
          allergenSuggestions={allergenTags}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6">
          <ShiftOpenForm branchId={DEFAULT_BRANCH_ID} employeeId={employee.id} />
        </div>
      )}
    </AuthenticatedShell>
  );
}
