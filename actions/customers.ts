"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import type { CustomerGender } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId, assertSessionEmployee } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { normalizeEmail, normalizePhoneMx } from "@/lib/validation";

// Validaciones comunes de alta/edición — el teléfono es @unique en la base;
// sin este chequeo el duplicado solo llegaba como error genérico de Prisma.
async function validateContact(
  input: { phone?: string; email?: string },
  excludeCustomerId?: string
) {
  const email = normalizeEmail(input.email);
  if (email) {
    const sameEmail = await prisma.customer.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
      },
    });
    if (sameEmail) {
      throw new Error(`Ya existe un cliente con ese email (${sameEmail.name}).`);
    }
  }
  const phone = normalizePhoneMx(input.phone);
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
        phone: normalizePhoneMx(input.phone),
        email: normalizeEmail(input.email),
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

    // Cupón de bienvenida: % y vigencia de Configuración → Lealtad
    // (10%, sin vencimiento por defecto; 0% = no se crea), personal (solo
    // ese cliente lo puede usar) y de un solo uso — ver
    // actions/discounts.ts (findDiscountCodeByCode) y actions/pos.ts
    // (validateAndConsumeDiscountCode).
    const branch = await tx.branch.findUnique({
      where: { id: DEFAULT_BRANCH_ID },
      select: { welcomeCouponPercent: true, welcomeCouponValidDays: true },
    });
    const couponPercent = branch?.welcomeCouponPercent ?? 10;
    const validDays = branch?.welcomeCouponValidDays ?? null;
    const welcomeCoupon =
      couponPercent > 0
        ? await tx.discountCode.create({
            data: {
              code: generateWelcomeCouponCode(),
              type: "PORCENTAJE",
              value: couponPercent,
              customerId: customer.id,
              expiresAt: validDays ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000) : null,
            },
          })
        : null;

    return { customer, loyaltyCard, welcomeCoupon };
  });

  revalidatePath("/clientes");

  return {
    id: customer.id,
    loyaltyCardCode: loyaltyCard.code!,
    welcomeCouponCode: welcomeCoupon?.code ?? null,
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
      phone: input.phone === undefined ? undefined : normalizePhoneMx(input.phone),
      email: input.email === undefined ? undefined : normalizeEmail(input.email),
      address: optionalText(input.address),
      birthDate:
        input.birthDate === undefined ? undefined : input.birthDate ? new Date(input.birthDate) : null,
      gender: input.gender,
    },
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${input.customerId}`);
});
