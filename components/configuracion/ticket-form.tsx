"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTicketSettings as updateTicketSettingsAction } from "@/actions/settings";
import { withActionErrors } from "@/lib/action-result";
import { DEFAULT_TICKET_FOOTER_MESSAGE, type BusinessSettings } from "@/lib/settings-shared";
import { SettingsCard, useSyncedState } from "./settings-card";

const updateTicketSettings = withActionErrors(updateTicketSettingsAction);

export function TicketForm({ initial }: { initial: BusinessSettings }) {
  const [razonSocial, setRazonSocial] = useSyncedState(initial.razonSocial ?? "");
  const [rfc, setRfc] = useSyncedState(initial.rfc ?? "");
  const [logoUrl, setLogoUrl] = useSyncedState(initial.logoUrl ?? "");
  const [ticketFooterMessage, setTicketFooterMessage] = useSyncedState(initial.ticketFooterMessage ?? "");
  const [ticketPromoMessage, setTicketPromoMessage] = useSyncedState(initial.ticketPromoMessage ?? "");
  const [wifiNetwork, setWifiNetwork] = useSyncedState(initial.wifiNetwork ?? "");
  const [wifiPassword, setWifiPassword] = useSyncedState(initial.wifiPassword ?? "");

  return (
    <>
      <SettingsCard
        title="Datos fiscales y logo"
        description="Si se capturan, aparecen en el encabezado del ticket de venta, debajo del nombre del negocio."
        onSave={() =>
          updateTicketSettings({
            razonSocial,
            rfc,
            logoUrl,
            ticketFooterMessage,
            ticketPromoMessage,
            wifiNetwork,
            wifiPassword,
          })
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ticket-razon-social">Razón social (opcional)</Label>
            <Input
              id="ticket-razon-social"
              maxLength={120}
              placeholder="Solo si es distinta al nombre del negocio"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ticket-rfc">RFC (opcional)</Label>
            <Input
              id="ticket-rfc"
              maxLength={13}
              placeholder="XAXX010101000"
              value={rfc}
              onChange={(e) => setRfc(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ticket-logo">Logo (opcional)</Label>
          <Input
            id="ticket-logo"
            type="url"
            placeholder="https://…"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Link a una imagen — no hay almacenamiento de archivos en el sistema.</p>
          {logoUrl.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Vista previa del logo" className="mt-1 h-16 w-auto object-contain" />
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Pie del ticket"
        description="Mensaje de despedida, promoción y datos del wifi — se imprimen al final del ticket de venta."
        onSave={() =>
          updateTicketSettings({
            razonSocial,
            rfc,
            logoUrl,
            ticketFooterMessage,
            ticketPromoMessage,
            wifiNetwork,
            wifiPassword,
          })
        }
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="ticket-footer">Frase de despedida (opcional)</Label>
          <Input
            id="ticket-footer"
            maxLength={120}
            placeholder={DEFAULT_TICKET_FOOTER_MESSAGE}
            value={ticketFooterMessage}
            onChange={(e) => setTicketFooterMessage(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ticket-promo">Mensaje promocional (opcional)</Label>
          <Input
            id="ticket-promo"
            maxLength={160}
            placeholder="ej. 10% de descuento en tu próxima visita con este ticket"
            value={ticketPromoMessage}
            onChange={(e) => setTicketPromoMessage(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ticket-wifi-network">Red de wifi (opcional)</Label>
            <Input
              id="ticket-wifi-network"
              maxLength={60}
              value={wifiNetwork}
              onChange={(e) => setWifiNetwork(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ticket-wifi-password">Contraseña del wifi (opcional)</Label>
            <Input
              id="ticket-wifi-password"
              maxLength={60}
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          El wifi solo se imprime si se captura la red — déjala vacía si no quieres mostrarlo.
        </p>
      </SettingsCard>
    </>
  );
}
