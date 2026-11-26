import type { Metadata } from "next";
import QRCode from "qrcode";
import { getPublicLoyaltyCard } from "@/lib/loyalty";
import { orNotFound } from "@/lib/not-found";
import { getBusinessSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Tarjeta de lealtad" };

// Página pública (sin sesión — la única de la app) de la tarjeta de
// lealtad de un cliente. El link se manda por WhatsApp al registrar al
// cliente (ver checkout-dialog.tsx / componente de /clientes/nuevo).
// No es un pase nativo de Apple/Google Wallet (eso requiere cuentas de
// desarrollador que el negocio no tiene todavía, ver docs/CONTINUE.md)
// — es una página web pensada para verse bien en el navegador del
// celular, con el mismo código QR que ya se usa para buscar al cliente
// en el checkout.
export default async function TarjetaLealtadPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // Tarjeta inexistente -> 404 real (ver not-found.tsx de esta ruta).
  const [card, settings] = await Promise.all([orNotFound(getPublicLoyaltyCard(code)), getBusinessSettings()]);
  const qrSvg = await QRCode.toString(card.code, { type: "svg", width: 180, margin: 1 });
  const firstName = card.customerName.trim().split(" ")[0];

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {settings.businessName}
        </p>
        <h1 className="mt-1 text-center text-xl font-semibold">Hola, {firstName}</h1>
        <p className="text-center text-sm text-muted-foreground">Esta es tu tarjeta de lealtad</p>

        <div className="mt-6 flex justify-center" dangerouslySetInnerHTML={{ __html: qrSvg }} />

        <div className="mt-6 flex flex-col gap-4">
          {card.programs.map((p) => (
            <div key={p.program} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">{card.programs.length > 1 ? p.label : "Tus puntos"}</p>
                <p className="text-lg font-semibold">{p.points} pts</p>
              </div>
              {p.nextTier ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, (p.points / p.nextTier.pointsRequired) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.tier ? `Nivel ${p.tier.name} · ` : ""}te faltan {p.nextTier.missing} pts para {p.nextTier.name}
                  </p>
                </>
              ) : (
                p.tier && <p className="text-xs text-muted-foreground">Nivel {p.tier.name} — ¡el más alto!</p>
              )}
              {p.tier?.benefits && <p className="text-xs text-muted-foreground">{p.tier.benefits}</p>}
            </div>
          ))}
        </div>

        {card.coupons.length > 0 && (
          <div className="mt-6 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-4 text-center">
            <p className="text-sm font-semibold">🎉 Tus cupones</p>
            {card.coupons.map((c) => (
              <div key={c.code}>
                <p className="text-sm">{c.label}</p>
                <p className="font-mono text-sm font-semibold">{c.code}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Muéstralos en caja.</p>
          </div>
        )}
      </div>
      {(settings.address || settings.phone) && (
        <p className="mt-4 max-w-sm text-center text-xs text-muted-foreground">
          {[settings.address, settings.phone].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
