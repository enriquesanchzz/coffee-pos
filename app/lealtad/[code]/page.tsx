import QRCode from "qrcode";
import { getPublicLoyaltyCard } from "@/lib/loyalty";

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
  const card = await getPublicLoyaltyCard(code);

  if (!card) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <p className="text-center text-sm text-muted-foreground">
          No encontramos esta tarjeta de lealtad. Verifica el link.
        </p>
      </div>
    );
  }

  const qrSvg = await QRCode.toString(card.code, { type: "svg", width: 180, margin: 1 });
  const firstName = card.customerName.trim().split(" ")[0];
  const filledStamps = card.stamps % 5;

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nomada Café
        </p>
        <h1 className="mt-1 text-center text-xl font-semibold">Hola, {firstName}</h1>
        <p className="text-center text-sm text-muted-foreground">Esta es tu tarjeta de lealtad</p>

        <div className="mt-6 flex justify-center" dangerouslySetInnerHTML={{ __html: qrSvg }} />

        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-sm font-medium">{filledStamps} de 5 sellos</p>
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={
                  "h-6 w-6 rounded-full border-2 " +
                  (i < filledStamps ? "border-primary bg-primary" : "border-border bg-transparent")
                }
              />
            ))}
          </div>
          {card.tierName && (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Nivel {card.tierName}
              {card.tierBenefits && ` — ${card.tierBenefits}`}
            </p>
          )}
        </div>

        {card.welcomeCoupon && (
          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-4 text-center">
            <p className="text-sm font-semibold">🎉 {card.welcomeCoupon.value}% en tu próxima compra</p>
            <p className="mt-1 text-xs text-muted-foreground">Muestra este código en caja:</p>
            <p className="mt-1 font-mono text-sm font-semibold">{card.welcomeCoupon.code}</p>
          </div>
        )}
      </div>
    </div>
  );
}
