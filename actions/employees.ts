"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { hashSecret } from "@/lib/password";
import { requirePasswordSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

const PIN_PATTERN = /^\d{4,6}$/;

// Alta/edición de empleados solo desde una sesión de Administración
// (password, no PIN) — no reciben employeeId del cliente porque el actor se
// deriva siempre de la sesión del servidor, no hay forma de spoofearlo.
async function requireEmployeeManager(permission: "EMPLEADO_CREAR" | "EMPLEADO_MODIFICAR") {
  const actor = await requirePasswordSession();
  if (!actor) {
    throw new Error("Necesitas iniciar sesión de Administración para hacer esto.");
  }
  await requirePermission(actor.id, DEFAULT_BRANCH_ID, permission);
  return actor;
}

export type CreateEmployeeInput = {
  name: string;
  email?: string;
  pin?: string;
  password?: string;
  roleId: string;
  isCashier: boolean;
};

export async function createEmployee(input: CreateEmployeeInput) {
  await requireEmployeeManager("EMPLEADO_CREAR");

  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre es obligatorio.");
  }
  const pin = input.pin?.trim();
  const password = input.password?.trim();
  if (!pin && !password) {
    throw new Error("Captura un PIN, un password, o ambos.");
  }
  if (pin && !PIN_PATTERN.test(pin)) {
    throw new Error("El PIN debe ser numérico (4 a 6 dígitos).");
  }
  if (password && password.length < 8) {
    throw new Error("El password debe tener al menos 8 caracteres.");
  }
  if (!input.roleId) {
    throw new Error("Elige un rol.");
  }

  const pinHash = pin ? await hashSecret(pin) : null;
  const passwordHash = password ? await hashSecret(password) : null;

  await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        name,
        email: input.email?.trim() || null,
        pin: pinHash,
        passwordHash,
      },
    });

    await tx.employeeBranch.create({
      data: {
        employeeId: employee.id,
        branchId: DEFAULT_BRANCH_ID,
        roleId: input.roleId,
        isPrimary: true,
        isCashier: input.isCashier,
      },
    });
  });

  revalidatePath("/administracion");
}

export type UpdateEmployeeInput = {
  employeeId: string;
  name: string;
  email?: string;
  pin?: string; // vacío = no cambiar
  password?: string; // vacío = no cambiar
  isActive: boolean;
  roleId: string;
  isCashier: boolean;
};

export async function updateEmployee(input: UpdateEmployeeInput) {
  await requireEmployeeManager("EMPLEADO_MODIFICAR");

  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre es obligatorio.");
  }
  const pin = input.pin?.trim();
  const password = input.password?.trim();
  if (pin && !PIN_PATTERN.test(pin)) {
    throw new Error("El PIN debe ser numérico (4 a 6 dígitos).");
  }
  if (password && password.length < 8) {
    throw new Error("El password debe tener al menos 8 caracteres.");
  }
  if (!input.roleId) {
    throw new Error("Elige un rol.");
  }

  const newPinHash = pin ? await hashSecret(pin) : undefined;
  const newPasswordHash = password ? await hashSecret(password) : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: input.employeeId },
      data: {
        name,
        email: input.email?.trim() || null,
        isActive: input.isActive,
        ...(newPinHash ? { pin: newPinHash } : {}),
        ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}),
      },
    });

    await tx.employeeBranch.upsert({
      where: {
        employeeId_branchId: { employeeId: input.employeeId, branchId: DEFAULT_BRANCH_ID },
      },
      update: { roleId: input.roleId, isCashier: input.isCashier },
      create: {
        employeeId: input.employeeId,
        branchId: DEFAULT_BRANCH_ID,
        roleId: input.roleId,
        isPrimary: true,
        isCashier: input.isCashier,
      },
    });
  });

  revalidatePath("/administracion");
}
