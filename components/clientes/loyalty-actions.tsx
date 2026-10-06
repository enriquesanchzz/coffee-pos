"use client";

import { useBusinessSettings } from "@/components/layout/business-settings-context";
import { useEffect, useState } from "react";
import { buildWhatsAppLoyaltyLink } from "@/lib/utils";

// Acciones de lealtad en el detalle del cliente (QA-020): abrir la tarjeta
// pública y reenviarla por WhatsApp — antes solo se ofrecían justo al
// crear al cliente. Componente cliente porque el link usa el origen del
// navegador (window.location.origin).
export function LoyaltyActions({
  phone,
  loyaltyCode,
  welcomeCouponCode,
}: {
  phone: string | null;
  loyaltyCode: string;
  welcomeCouponCode: string | null;
}) {
  // El origen se lee al montar (no en el render) para que el HTML del
  // servidor coincida al hidratar.
  const { businessName, welcomeCouponPercent } = useBusinessSettings();
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const whatsappLink =
    origin && phone
      ? buildWhatsAppLoyaltyLink({
          phone,
          origin,
          loyaltyCardCode: loyaltyCode,
          welcomeCouponCode,
          businessName,
          welcomeCouponPercent,
        })
      : null;

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <a
        href={`/lealtad/${loyaltyCode}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center rounded-md border border-border px-3 hover:bg-muted"
      >
        Ver tarjeta
      </a>
      {whatsappLink ? (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center rounded-md border border-border px-3 hover:bg-muted"
        >
          Enviar por WhatsApp
        </a>
      ) : origin ? (
        <span className="self-center text-xs text-muted-foreground">
          Captura un teléfono de 10 dígitos para enviarla por WhatsApp.
        </span>
      ) : null}
    </div>
  );
}
