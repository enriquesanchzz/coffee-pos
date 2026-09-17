import { prisma } from "./prisma";

export type PublicLoyaltyCard = {
  customerName: string;
  code: string;
  stamps: number;
  tierName: string | null;
  tierBenefits: string | null;
  welcomeCoupon: { code: string; value: number } | null;
};

// DTO mínimo para /lealtad/[code] — la única ruta pública (sin sesión)
// de la app, así que solo trae lo que es seguro mostrar a cualquiera
// que tenga el link: nombre, sellos, nivel y el cupón de bienvenida si
// sigue sin usar. Nada de teléfono/email/historial de compras (eso vive
// en getCustomerDetail, de uso exclusivo del staff).
export async function getPublicLoyaltyCard(code: string): Promise<PublicLoyaltyCard | null> {
  const card = await prisma.loyaltyCard.findUnique({
    where: { code },
    include: { customer: true, tier: true },
  });
  if (!card) return null;

  const welcomeCoupon = await prisma.discountCode.findFirst({
    where: { customerId: card.customerId, usedAt: null, isActive: true },
    orderBy: { id: "desc" },
  });

  return {
    customerName: card.customer.name,
    code: card.code!,
    stamps: card.stamps,
    tierName: card.tier?.name ?? null,
    tierBenefits: card.tier?.benefits ?? null,
    welcomeCoupon: welcomeCoupon
      ? { code: welcomeCoupon.code, value: welcomeCoupon.value.toNumber() }
      : null,
  };
}
