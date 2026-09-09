import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getCatalog, getOpenShift, getExtraIngredientOptions } from "@/lib/catalog";
import { getCustomerOptions } from "@/lib/customers";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { Sidebar } from "@/components/layout/sidebar";
import { PosWorkspace } from "@/components/pos/pos-workspace";
import { ShiftOpenForm } from "@/components/pos/shift-open-form";

export default async function PosPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const [shift, catalog, customers, extraIngredientOptions] = await Promise.all([
    getOpenShift(DEFAULT_BRANCH_ID),
    getCatalog(DEFAULT_BRANCH_ID),
    getCustomerOptions(),
    getExtraIngredientOptions(),
  ]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        {shift ? (
          <PosWorkspace
            catalog={catalog}
            branchId={DEFAULT_BRANCH_ID}
            shiftId={shift.id}
            employee={{ id: employee.id, name: employee.name }}
            customers={customers}
            extraIngredientOptions={extraIngredientOptions}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <ShiftOpenForm branchId={DEFAULT_BRANCH_ID} employeeId={employee.id} />
          </div>
        )}
      </div>
    </div>
  );
}
