"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import type { DiscountType, DiscountCodeCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission, requireAdminRole } from "@/lib/permissions";

export type CreateDiscountCodeInput = {
  employeeId: string;
  code: string;
  type: DiscountType;
  value: number;
  expiresAt?: string; // ISO date, opcional
  category?: DiscountCodeCategory | null;
};

export const createDiscountCode = safeAction(async function createDiscountCode(input: CreateDiscountCodeInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const code = input.code.trim().toUpperCase();
  if (!code) {
    throw new Error("El código es obligatorio.");
  }
  if (input.value <= 0) {
    throw new Error("El valor del descuento debe ser mayor a cero.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "DESCUENTO_CODIGO_CREAR");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  await prisma.discountCode.create({
    data: {
      code,
      type: input.type,
      value: input.value,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      category: input.category ?? null,
    },
  });

  revalidatePath("/descuentos");
});

export type UpdateDiscountCodeInput = {
  employeeId: string;
  discountCodeId: string;
  code: string;
  type: DiscountType;
  value: number;
  expiresAt?: string; // ISO date, opcional
  category?: DiscountCodeCategory | null;
  isActive: boolean;
};

export const updateDiscountCode = safeAction(async function updateDiscountCode(input: UpdateDiscountCodeInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const code = input.code.trim().toUpperCase();
  if (!code) {
    throw new Error("El código es obligatorio.");
  }
  if (input.value <= 0) {
    throw new Error("El valor del descuento debe ser mayor a cero.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "DESCUENTO_CODIGO_CREAR");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  await prisma.discountCode.update({
    where: { id: input.discountCodeId },
    data: {
      code,
      type: input.type,
      value: input.value,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      category: input.category ?? null,
      isActive: input.isActive,
    },
  });

  revalidatePath("/descuentos");
});

export type FindDiscountCodeByCodeInput = {
  employeeId: string;
  code: string;
  // Cliente seleccionado en la venta actual — obligatorio para validar
  // un código personal (ver DiscountCode.customerId). Un código
  // genérico (customerId null) no lo necesita.
  customerId?: string;
};

export type FoundDiscountCode = {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
};

// Usado desde el checkout: el cajero teclea el código de texto que le dio
// el cliente, no conoce el id.
export const findDiscountCodeByCode = safeAction(async function findDiscountCodeByCode(
  input: FindDiscountCodeByCodeInput
): Promise<FoundDiscountCode> {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "DESCUENTO_APLICAR_CODIGO");

  const discountCode = await prisma.discountCode.findUnique({
    where: { code: input.code.trim().toUpperCase() },
  });

  if (!discountCode) {
    throw new Error("Ese código de descuento no existe.");
  }
  if (!discountCode.isActive) {
    throw new Error("Ese código de descuento está inactivo.");
  }
  if (discountCode.expiresAt && discountCode.expiresAt < new Date()) {
    throw new Error("Ese código de descuento ya expiró.");
  }
  // Cupón personal (ej. el de bienvenida al registrar cliente, ver
  // actions/customers.ts) — solo lo puede usar ese cliente, y solo una
  // vez.
  if (discountCode.customerId) {
    if (discountCode.customerId !== input.customerId) {
      throw new Error("Este cupón es para otro cliente.");
    }
    if (discountCode.usedAt) {
      throw new Error("Este cupón ya se usó.");
    }
  }

  return {
    id: discountCode.id,
    code: discountCode.code,
    type: discountCode.type,
    value: discountCode.value.toNumber(),
  };
});
