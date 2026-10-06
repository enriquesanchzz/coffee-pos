import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { BusinessForm } from "@/components/configuracion/business-form";

export const metadata: Metadata = { title: "Configuración · Negocio" };

export default async function ConfiguracionNegocioPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage employeeName={actor.name} title="Negocio" description="Nombre, contacto y zona horaria de la sucursal.">
      <BusinessForm initial={settings} />
    </ConfigSectionPage>
  );
}
