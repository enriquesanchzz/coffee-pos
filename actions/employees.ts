"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { hashSecret } from "@/lib/password";
import { isPinTaken, requirePasswordSession, resolveRoleName } from "@/lib/session";
import { isValidEmail } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";

const PIN_PATTERN = /^\d{4,6}$/;

const PIN_TAKEN_MESSAGE = "Ese PIN ya lo usa otro empleado activo. Elige uno distinto.";

// Alta/edición de empleados solo desde una sesión de Administración
// (password, no PIN) — no reciben employeeId del cliente porque el actor se
// deriva siempre de la sesión del servidor, no hay forma de spoofearlo.
// Exclusivo de rol ADMINISTRADOR (no solo el permiso): ver "cambios de
// administración" en docs/CONTINUE.md — ocultar la página no basta si la
// Server Action detrás sigue aceptando el permiso granular de otro rol.
async function requireEmployeeManager(permission: "EMPLEADO_CREAR" | "EMPLEADO_MODIFICAR") {
  const actor = await requirePasswordSession();
  if (!actor) {
    throw new Error("Necesitas iniciar sesión de Administración para hacer esto.");
  }
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") {
    throw new Error("Esta acción es exclusiva del rol ADMINISTRADOR.");
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

export const createEmployee = safeAction(async function createEmployee(input: CreateEmployeeInput) {
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
  if (input.email?.trim() && !isValidEmail(input.email.trim())) {
    throw new Error("El email no es válido.");
  }
  if (pin && (await isPinTaken(pin))) {
    throw new Error(PIN_TAKEN_MESSAGE);
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

  revalidatePath("/empleados");
});

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

// Administración (y por lo tanto la gestión de empleados) es exclusiva del
// rol ADMINISTRADOR: si el único administrador activo pierde el rol o se
// desactiva, nadie puede volver a entrar a corregirlo desde la app
// (QA-001). Se valida contra la base, no contra lo que diga el cliente.
async function assertKeepsAnAdmin(employeeId: string, newRoleId: string, willBeActive: boolean) {
  const adminRole = await prisma.role.findUnique({ where: { name: "ADMINISTRADOR" } });
  if (!adminRole) return;
  const staysAdmin = newRoleId === adminRole.id && willBeActive;
  if (staysAdmin) return;

  const otherActiveAdmins = await prisma.employeeBranch.count({
    where: {
      branchId: DEFAULT_BRANCH_ID,
      roleId: adminRole.id,
      employeeId: { not: employeeId },
      employee: { isActive: true },
    },
  });
  if (otherActiveAdmins === 0) {
    throw new Error(
      "Debe quedar al menos un administrador activo. Asigna el rol ADMINISTRADOR a otra persona antes de cambiar este."
    );
  }
}

export const updateEmployee = safeAction(async function updateEmployee(input: UpdateEmployeeInput) {
  const actor = await requireEmployeeManager("EMPLEADO_MODIFICAR");

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
  if (input.email?.trim() && !isValidEmail(input.email.trim())) {
    throw new Error("El email no es válido.");
  }
  if (pin && (await isPinTaken(pin, input.employeeId))) {
    throw new Error(PIN_TAKEN_MESSAGE);
  }
  await assertKeepsAnAdmin(input.employeeId, input.roleId, input.isActive);

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

  revalidatePath("/empleados");
  // Si alguien se quitó a sí mismo el rol o el acceso, el formulario debe
  // explicarlo en vez de que la siguiente página lo mande a /pos sin aviso.
  return { changedOwnAccess: actor?.id === input.employeeId };
});
