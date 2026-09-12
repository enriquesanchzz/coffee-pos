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

export async function createCustomer(input: CreateCustomerInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "CLIENTE_CONFIGURAR");

  const customer = await prisma.customer.create({
    data: {
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
    },
  });

  revalidatePath("/clientes");

  return { id: customer.id };
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
