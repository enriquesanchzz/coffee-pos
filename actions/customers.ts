"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import type { CustomerGender } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId, assertSessionEmployee } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { isValidEmail } from "@/lib/utils";

// Validaciones comunes de alta/edición — el teléfono es @unique en la base;
// sin este chequeo el duplicado solo llegaba como error genérico de Prisma.
async function validateContact(
  input: { phone?: string; email?: string },
  excludeCustomerId?: string
) {
  const email = input.email?.trim();
  if (email && !isValidEmail(email)) {
    throw new Error("El email no es válido.");
  }
  const phone = input.phone?.trim();
  if (phone) {
    const existing = await prisma.customer.findFirst({
      where: { phone, ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}) },
    });
    if (existing) {
      throw new Error(`Ya existe un cliente con ese teléfono (${existing.name}).`);
    }
  }
}

export type CreateCustomerInput = {
  employeeId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string; // para pedidos "A domicilio"
  birthDate?: string; // ISO date, opcional
  gender?: CustomerGender; // opcional — solo para estadísticas, ver lib/customers.ts
};

// Código legible del cupón de bienvenida — suficiente entropía (36^6 ≈
// 2 mil millones de combinaciones) para que una colisión contra el
// @unique de DiscountCode.code sea prácticamente imposible a esta
// escala.
function generateWelcomeCouponCode(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BIENVENIDA-${suffix}`;
}

export const createCustomer = safeAction(async function createCustomer(input: CreateCustomerInput) {
  await assertSessionEmployee(input.employeeId);
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR");
  await validateContact(input);

  const { customer, loyaltyCard, welcomeCoupon } = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        gender: input.gender ?? null,
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
});

// Actualización parcial: un campo omitido (undefined) se conserva tal cual;
// una cadena vacía (o null en gender) lo borra. Antes reemplazaba el
// registro completo, así que editar desde /clientes/[id] (que no captura
// domicilio) borraba el domicilio guardado desde el POS.
export type UpdateCustomerInput = {
  employeeId: string;
  customerId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
  gender?: CustomerGender | null;
};

function optionalText(value: string | undefined) {
  return value === undefined ? undefined : value.trim() || null;
}

export const updateCustomer = safeAction(async function updateCustomer(input: UpdateCustomerInput) {
  await assertSessionEmployee(input.employeeId);
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR");
  await validateContact(input, input.customerId);

  await prisma.customer.update({
    where: { id: input.customerId },
    data: {
      name,
      phone: optionalText(input.phone),
      email: optionalText(input.email),
      address: optionalText(input.address),
      birthDate:
        input.birthDate === undefined ? undefined : input.birthDate ? new Date(input.birthDate) : null,
      gender: input.gender,
    },
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${input.customerId}`);
});
