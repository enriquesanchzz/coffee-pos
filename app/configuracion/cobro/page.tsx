import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { PaymentSettingsForm } from "@/components/configuracion/payment-settings-form";

export const metadata: Metadata = { title: "Configuración · Cobro" };

export default async function ConfiguracionCobroPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage employeeName={actor.name} title="Cobro" description="Propinas sugeridas, métodos de pago y atajos de efectivo del punto de venta.">
      <PaymentSettingsForm initial={settings} />
    </ConfigSectionPage>
  );
}
