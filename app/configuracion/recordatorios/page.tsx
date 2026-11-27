import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { ReminderSettingsForm } from "@/components/configuracion/reminder-settings-form";

export const metadata: Metadata = { title: "Configuración · Recordatorios" };

export default async function ConfiguracionRecordatoriosPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage
      employeeName={actor.name}
      title="Recordatorios"
      description="“Te extrañamos” de Cafetería y recordatorio de resurtido de Pet Shop, para mandar por WhatsApp."
    >
      <ReminderSettingsForm initial={settings} />
    </ConfigSectionPage>
  );
}
