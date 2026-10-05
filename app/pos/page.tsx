import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { getCatalog, getOpenShift, getExtraIngredientOptions, getTopSellingProductIds } from "@/lib/catalog";
import { getCustomerOptions } from "@/lib/customers";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PosWorkspace } from "@/components/pos/pos-workspace";
import { ShiftOpenForm } from "@/components/pos/shift-open-form";

export default async function PosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  const isAdmin = resolveRoleName(employee, DEFAULT_BRANCH_ID) === "ADMINISTRADOR";

  const [shift, catalog, customers, extraIngredientOptions, favoriteProductIds] = await Promise.all([
    getOpenShift(DEFAULT_BRANCH_ID),
    getCatalog(DEFAULT_BRANCH_ID),
    getCustomerOptions(),
    getExtraIngredientOptions(),
    getTopSellingProductIds(DEFAULT_BRANCH_ID),
  ]);

  return (
    <AuthenticatedShell isAdmin={isAdmin} employeeName={employee.name} contentClassName="overflow-hidden">
      {shift ? (
        <PosWorkspace
          catalog={catalog}
          branchId={DEFAULT_BRANCH_ID}
          shiftId={shift.id}
          employee={{ id: employee.id, name: employee.name }}
          customers={customers}
          extraIngredientOptions={extraIngredientOptions}
          favoriteProductIds={favoriteProductIds}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6">
          <ShiftOpenForm branchId={DEFAULT_BRANCH_ID} employeeId={employee.id} />
        </div>
      )}
    </AuthenticatedShell>
  );
}
