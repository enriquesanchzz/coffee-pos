import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { requireAdminPage } from "@/lib/admin-page";
import { getCombos, getPromotions, getVariantOptions, getProductOptions } from "@/lib/promotions";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PromocionesWorkspace } from "@/components/promociones/promociones-workspace";

export const metadata: Metadata = { title: "Promociones" };

export default async function PromocionesPage() {
  const employee = await requireAdminPage("/promociones");
  if (!(await hasPermission(employee.id, DEFAULT_BRANCH_ID, "PROMOCION_GESTIONAR"))) {
    redirect("/administracion");
  }

  const [combos, promotions, variants, products] = await Promise.all([
    getCombos(),
    getPromotions(),
    getVariantOptions(),
    getProductOptions(),
  ]);

  return (
    <AuthenticatedShell isAdmin employeeName={employee.name} contentClassName="overflow-hidden">
      <PromocionesWorkspace
        combos={combos}
        promotions={promotions}
        variants={variants}
        products={products}
        employeeId={employee.id}
      />
    </AuthenticatedShell>
  );
}
