import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { DiscountSettingsForm } from "@/components/configuracion/discount-settings-form";

export const metadata: Metadata = { title: "Configuración · Descuentos" };

export default async function ConfiguracionDescuentosPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage employeeName={actor.name} title="Descuentos" description="Límites del descuento manual en caja.">
      <DiscountSettingsForm initial={settings} />
    </ConfigSectionPage>
  );
}
