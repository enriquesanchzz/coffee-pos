"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

export type CreateCustomerInput = {
  employeeId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string; // para pedidos "A domicilio"
  birthDate?: string; // ISO date, opcional
};

// Código legible del cupón de bienvenida — suficiente entropía (36^6 ≈
// 2 mil millones de combinaciones) para que una colisión contra el
// @unique de DiscountCode.code sea prácticamente imposible a esta
// escala.
function generateWelcomeCouponCode(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BIENVENIDA-${suffix}`;
}

export async function createCustomer(input: CreateCustomerInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR");

  const { customer, loyaltyCard, welcomeCoupon } = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
      },
    });

    // Tarjeta de lealtad creada de una vez (no hasta la primera venta,
    // como antes) para que /lealtad/[code] funcione desde el registro —
    // ver lib/loyalty.ts. applyLoyaltyStamp (actions/pos.ts) sigue
    // funcionando igual para clientes viejos sin tarjeta (upsert).
    const loyaltyCard = await tx.loyaltyCard.create({
      data: { customerId: customer.id, stamps: 0 },
    });

    // Cupón de bienvenida: 10% para su próxima compra, personal (solo
    // ese cliente lo puede usar) y de un solo uso — ver
    // actions/discounts.ts (findDiscountCodeByCode) y actions/pos.ts
    // (validateAndConsumeDiscountCode). Sin fecha de expiración a
    // propósito.
    const welcomeCoupon = await tx.discountCode.create({
      data: {
        code: generateWelcomeCouponCode(),
        type: "PORCENTAJE",
        value: 10,
        customerId: customer.id,
      },
    });

    return { customer, loyaltyCard, welcomeCoupon };
  });

  revalidatePath("/clientes");

  return {
    id: customer.id,
    loyaltyCardCode: loyaltyCard.code!,
    welcomeCouponCode: welcomeCoupon.code,
  };
}

export type UpdateCustomerInput = {
  employeeId: string;
  customerId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
};

export async function updateCustomer(input: UpdateCustomerInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR");

  await prisma.customer.update({
    where: { id: input.customerId },
    data: {
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
    },
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${input.customerId}`);
}
