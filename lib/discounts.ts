import { prisma } from "./prisma";
import type { DiscountCodeCategory } from "@prisma/client";

// Estado real del código (QA-008): antes solo se veía isActive, y un cupón
// ya usado o un código vencido aparecían como "activo".
export type DiscountCodeStatus = "ACTIVO" | "USADO" | "VENCIDO" | "INACTIVO";

export type DiscountCodeListItem = {
  id: string;
  code: string;
  type: string;
  value: number;
  isActive: boolean;
  status: DiscountCodeStatus;
  expiresAt: string | null;
  category: DiscountCodeCategory | null;
  // Cupón personal (ej. bienvenida): a quién pertenece.
  customerName: string | null;
};

export async function getDiscountCodes(): Promise<DiscountCodeListItem[]> {
  const codes = await prisma.discountCode.findMany({
    orderBy: { code: "asc" },
    include: { customer: true },
  });
  const now = new Date();
  return codes.map((discountCode) => ({
    id: discountCode.id,
    code: discountCode.code,
    type: discountCode.type,
    value: discountCode.value.toNumber(),
    isActive: discountCode.isActive,
    status: !discountCode.isActive
      ? "INACTIVO"
      : discountCode.customerId && discountCode.usedAt
        ? "USADO"
        : discountCode.expiresAt && discountCode.expiresAt < now
          ? "VENCIDO"
          : "ACTIVO",
    expiresAt: discountCode.expiresAt?.toISOString() ?? null,
    category: discountCode.category,
    customerName: discountCode.customer?.name ?? null,
  }));
}
