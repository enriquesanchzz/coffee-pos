import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { ShiftSettingsForm } from "@/components/configuracion/shift-settings-form";

export const metadata: Metadata = { title: "Configuración · Caja y turnos" };

export default async function ConfiguracionCajaPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage employeeName={actor.name} title="Caja y turnos" description="Valores sugeridos al abrir turno y reglas del corte de caja.">
      <ShiftSettingsForm initial={settings} />
    </ConfigSectionPage>
  );
}
