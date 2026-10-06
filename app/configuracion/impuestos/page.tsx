import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { TaxSettingsForm } from "@/components/configuracion/tax-settings-form";

export const metadata: Metadata = { title: "Configuración · Impuestos" };

export default async function ConfiguracionImpuestosPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage employeeName={actor.name} title="Impuestos" description="Desglose del IVA contenido en cada venta.">
      <TaxSettingsForm initial={settings} />
    </ConfigSectionPage>
  );
}
