"use server";

import { revalidatePath } from "next/cache";
import { ShiftType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OpenShiftInput = {
  branchId: string;
  cashierId: string;
  type: ShiftType;
  openingCash: number;
};

// Apertura mínima de turno: el módulo Caja completo (doble confirmación de
// apertura/cierre, cortes, retiros e ingresos vía CashMovement) todavía no
// existe — ver docs/roadmap.md. Esto solo crea el `Shift` que `Sale.shiftId`
// exige para poder vender.
export async function openShift(input: OpenShiftInput) {
  const existing = await prisma.shift.findFirst({
    where: { branchId: input.branchId, status: "ABIERTO" },
  });
  if (existing) {
    throw new Error("Ya hay un turno abierto en esta sucursal.");
  }

  const shift = await prisma.shift.create({
    data: {
      branchId: input.branchId,
      cashierId: input.cashierId,
      type: input.type,
      openingCash: input.openingCash,
      status: "ABIERTO",
    },
  });

  revalidatePath("/pos");
  return shift;
}
