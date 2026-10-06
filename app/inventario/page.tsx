import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentEmployee, resolveRoleName } from "@/lib/session";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getInventoryOverview, getIngredientCategories } from "@/lib/inventory";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { InventoryWorkspace } from "@/components/inventario/inventory-workspace";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventarioPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (resolveRoleName(employee, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");

  const [items, categories] = await Promise.all([getInventoryOverview(), getIngredientCategories()]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <InventoryWorkspace items={items} categories={categories} employeeId={employee.id} />
    </AuthenticatedShell>
  );
}
