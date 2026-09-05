import { prisma } from "./prisma";

export type DiscountCodeListItem = {
  id: string;
  code: string;
  type: string;
  value: number;
  isActive: boolean;
  expiresAt: string | null;
};

export async function getDiscountCodes(): Promise<DiscountCodeListItem[]> {
  const codes = await prisma.discountCode.findMany({ orderBy: { code: "asc" } });
  return codes.map((discountCode) => ({
    id: discountCode.id,
    code: discountCode.code,
    type: discountCode.type,
    value: discountCode.value.toNumber(),
    isActive: discountCode.isActive,
    expiresAt: discountCode.expiresAt?.toISOString() ?? null,
  }));
}
