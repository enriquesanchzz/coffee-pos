"use server";

import { revalidatePath } from "next/cache";
import { CashMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

export type CreateCashMovementInput = {
  shiftId: string;
  employeeId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
};

export async function createCashMovement(input: CreateCashMovementInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.amount <= 0) {
    throw new Error("El monto debe ser mayor a cero.");
  }
  if (!input.reason.trim()) {
    throw new Error("Captura el motivo del movimiento.");
  }

  const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } });
  if (!shift || shift.status !== "ABIERTO") {
    throw new Error("No hay un turno abierto válido para este movimiento.");
  }

  await requirePermission(input.employeeId, shift.branchId, "CAJA_CHICA_MODIFICAR");

  await prisma.cashMovement.create({
    data: {
      shiftId: input.shiftId,
      employeeId: input.employeeId,
      type: input.type,
      amount: input.amount,
      reason: input.reason.trim(),
    },
  });

  revalidatePath("/pos");
  revalidatePath("/caja");
}
