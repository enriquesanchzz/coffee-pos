import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/session";
import { getOpenShift } from "@/lib/catalog";
import { getShiftDetail } from "@/lib/shift";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { Sidebar } from "@/components/layout/sidebar";
import { ShiftOpenForm } from "@/components/pos/shift-open-form";
import { ShiftSummary } from "@/components/caja/shift-summary";

export default async function CajaPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const shift = await getOpenShift(DEFAULT_BRANCH_ID);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
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
      </div>
    </div>
  );
}
