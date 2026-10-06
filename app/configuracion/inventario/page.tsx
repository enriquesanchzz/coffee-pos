import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { getInventoryOverview } from "@/lib/inventory";
import { unitLabel } from "@/lib/utils";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { InventorySettingsForm } from "@/components/configuracion/inventory-settings-form";
import { ReorderThresholdsEditor } from "@/components/configuracion/reorder-thresholds-editor";

export const metadata: Metadata = { title: "Configuración · Inventario" };

export default async function ConfiguracionInventarioPage() {
  const { actor, settings } = await loadConfigurationPage();
  const items = await getInventoryOverview();

  return (
    <ConfigSectionPage
      employeeName={actor.name}
      title="Inventario"
      description="Venta con faltantes y alertas de stock bajo."
    >
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
    </ConfigSectionPage>
  );
}
