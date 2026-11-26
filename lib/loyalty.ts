import { prisma } from "./prisma";
import { getLoyaltySummary, type LoyaltyProgramSummary } from "./loyalty-points";
import { couponLabel, COUPON_LABEL_INCLUDE } from "./coupon-label";

export type PublicLoyaltyCard = {
  customerName: string;
  code: string;
  programs: LoyaltyProgramSummary[];
  coupons: { code: string; label: string }[];
};

// DTO mínimo para /lealtad/[code] — ruta pública (sin sesión), así que
// solo trae lo que es seguro mostrar a cualquiera que tenga el link:
// nombre, puntos y nivel por programa y los cupones vigentes. Nada de
// teléfono/email/historial de compras (eso vive en getCustomerDetail, de
// uso exclusivo del staff).
export async function getPublicLoyaltyCard(code: string): Promise<PublicLoyaltyCard | null> {
  const card = await prisma.loyaltyCard.findUnique({
    where: { code },
    include: { customer: true },
  });
  if (!card) return null;

  const [programs, coupons] = await Promise.all([
    getLoyaltySummary(prisma, card.customerId),
    prisma.discountCode.findMany({
      where: {
        customerId: card.customerId,
        isActive: true,
        OR: [{ usedAt: null }, { isReusable: true }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
      include: COUPON_LABEL_INCLUDE,
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    customerName: card.customer.name,
    code: card.code!,
    programs,
    coupons: coupons.map((c) => ({ code: c.code, label: couponLabel(c) })),
  };
}
