import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { SecuritySettingsForm } from "@/components/configuracion/security-settings-form";

export const metadata: Metadata = { title: "Configuración · Seguridad" };

export default async function ConfiguracionSeguridadPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage employeeName={actor.name} title="Seguridad" description="Bloqueo por intentos fallidos y duración de la sesión.">
      <SecuritySettingsForm initial={settings} />
    </ConfigSectionPage>
  );
}
