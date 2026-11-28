import type { Metadata } from "next";
import { SettingsHeadingLevel } from "@/components/configuracion/settings-heading";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { getBusinessSettings } from "@/lib/settings";
import { getInventoryOverview } from "@/lib/inventory";
import { unitLabel } from "@/lib/utils";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { PageHeader } from "@/components/layout/page-header";
import { InventorySettingsForm } from "@/components/configuracion/inventory-settings-form";
import { ReorderThresholdsEditor } from "@/components/configuracion/reorder-thresholds-editor";

export const metadata: Metadata = { title: "Inventario · Ajustes" };

// Ajustes de inventario (antes en Configuración → Inventario): qué pasa al
// vender sin insumos suficientes y mínimos de stock por insumo. Guardar
// sigue pidiendo sesión de Administración con password.
export default async function InventarioAjustesPage() {
  const actor = await requireAdminPage("/inventario/ajustes");
  const [settings, items] = await Promise.all([getBusinessSettings(), getInventoryOverview()]);

  return (
    <AuthenticatedShell isAdmin employeeName={actor.name}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <Link href="/inventario" className="text-sm text-muted-foreground hover:underline">
          ← Inventario
        </Link>
        <PageHeader title="Ajustes de inventario" description="Venta con faltantes y alertas de stock bajo." />
        <SettingsHeadingLevel level="h2">
        <InventorySettingsForm initial={settings} />
        <ReorderThresholdsEditor
          rows={items.map((i) => ({
            ingredientId: i.id,
            name: i.name,
            categoryName: i.categoryName,
            unit: unitLabel(i.baseUnit),
            quantity: i.quantity,
            threshold: i.reorderThreshold,
          }))}
        />
        </SettingsHeadingLevel>
      </div>
    </AuthenticatedShell>
  );
}
