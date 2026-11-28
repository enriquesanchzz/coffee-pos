import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-page";
import { getInventoryOverview, getIngredientCategories } from "@/lib/inventory";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { InventoryWorkspace } from "@/components/inventario/inventory-workspace";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventarioPage() {
  const employee = await requireAdminPage("/inventario");

  const [items, categories] = await Promise.all([getInventoryOverview(), getIngredientCategories()]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <InventoryWorkspace items={items} categories={categories} employeeId={employee.id} />
    </AuthenticatedShell>
  );
}
