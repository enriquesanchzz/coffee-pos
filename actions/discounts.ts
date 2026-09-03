"use server";

import { revalidatePath } from "next/cache";
import type { DiscountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

export type CreateDiscountCodeInput = {
  employeeId: string;
  code: string;
  type: DiscountType;
  value: number;
  expiresAt?: string; // ISO date, opcional
};

export async function createDiscountCode(input: CreateDiscountCodeInput) {
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

  await prisma.discountCode.create({
    data: {
      code,
      type: input.type,
      value: input.value,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });

  revalidatePath("/clientes/descuentos");
}

export type ToggleDiscountCodeInput = {
  employeeId: string;
  discountCodeId: string;
  isActive: boolean;
};

export async function toggleDiscountCodeActive(input: ToggleDiscountCodeInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "DESCUENTO_CODIGO_CREAR");

  await prisma.discountCode.update({
    where: { id: input.discountCodeId },
    data: { isActive: input.isActive },
  });

  revalidatePath("/clientes/descuentos");
}

export type FindDiscountCodeByCodeInput = {
  employeeId: string;
  code: string;
};

export type FoundDiscountCode = {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
};

// Usado desde el checkout: el cajero teclea el código de texto que le dio
// el cliente, no conoce el id.
export async function findDiscountCodeByCode(
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

  return {
    id: discountCode.id,
    code: discountCode.code,
    type: discountCode.type,
    value: discountCode.value.toNumber(),
  };
}
