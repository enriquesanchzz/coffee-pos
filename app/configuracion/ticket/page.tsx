import type { Metadata } from "next";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { TicketForm } from "@/components/configuracion/ticket-form";

export const metadata: Metadata = { title: "Configuración · Ticket" };

export default async function ConfiguracionTicketPage() {
  const { actor, settings } = await loadConfigurationPage();

  return (
    <ConfigSectionPage
      employeeName={actor.name}
      title="Ticket"
      description="Qué lleva impreso el ticket de venta, además del nombre y la dirección (Configuración → Negocio)."
    >
      <TicketForm initial={settings} />
    </ConfigSectionPage>
  );
}
