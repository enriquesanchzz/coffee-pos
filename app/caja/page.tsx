import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { getOpenShift } from "@/lib/catalog";
import { getShiftDetail } from "@/lib/shift";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ShiftOpenForm } from "@/components/pos/shift-open-form";
import { ShiftSummary } from "@/components/caja/shift-summary";

export const metadata: Metadata = { title: "Caja" };

export default async function CajaPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  const isAdmin = resolveRoleName(employee, DEFAULT_BRANCH_ID) === "ADMINISTRADOR";

  const shift = await getOpenShift(DEFAULT_BRANCH_ID);

  return (
    <AuthenticatedShell isAdmin={isAdmin} employeeName={employee.name} contentClassName="overflow-hidden" srTitle="Caja">
      {shift ? (
        <ShiftSummary
          shift={await getShiftDetail(shift.id)}
          employee={{ id: employee.id, name: employee.name }}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6">
          <ShiftOpenForm branchId={DEFAULT_BRANCH_ID} employeeId={employee.id} />
        </div>
      )}
    </AuthenticatedShell>
  );
}
