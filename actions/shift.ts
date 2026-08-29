"use server";

import { revalidatePath } from "next/cache";
import { Permission, Prisma, ShiftType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findEmployeeByPin, getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

// -----------------------------------------------------------------------
// Doble confirmación (apertura y cierre): el PIN debe pertenecer a un
// empleado activo DISTINTO de quien cuenta la caja Y que tenga el permiso
// correspondiente (CAJA_ABRIR/CAJA_CERRAR) — respeta el criterio
// documentado en el schema: "preferentemente gerente, pero puede ser
// cualquier otro empleado si el gerente no está disponible", ahora
// verificado de verdad contra la matriz de permisos en vez de solo pedir
// "cualquier empleado distinto".
// -----------------------------------------------------------------------
async function verifyConfirmingEmployee(
  pin: string,
  excludeEmployeeId: string,
  branchId: string,
  permission: Permission
) {
  const employee = await findEmployeeByPin(pin);
  if (!employee) {
    throw new Error("PIN de confirmación incorrecto.");
  }
  if (employee.id === excludeEmployeeId) {
    throw new Error("La confirmación debe ser de un empleado distinto.");
  }
  await requirePermission(employee.id, branchId, permission);
  return employee;
}

export type OpenShiftInput = {
  branchId: string;
  cashierId: string;
  type: ShiftType;
  openingCash: number;
  confirmingPin: string;
};

export async function openShift(input: OpenShiftInput) {
  if (input.cashierId !== (await getSessionEmployeeId())) {
    throw new Error("El cajero no coincide con la sesión activa.");
  }

  const existing = await prisma.shift.findFirst({
    where: { branchId: input.branchId, status: "ABIERTO" },
  });
  if (existing) {
    throw new Error("Ya hay un turno abierto en esta sucursal.");
  }

  const confirmingEmployee = await verifyConfirmingEmployee(
    input.confirmingPin,
    input.cashierId,
    input.branchId,
    "CAJA_ABRIR"
  );

  const shift = await prisma.shift.create({
    data: {
      branchId: input.branchId,
      cashierId: input.cashierId,
      type: input.type,
      openingCash: input.openingCash,
      status: "ABIERTO",
      openingConfirmedById: confirmingEmployee.id,
      openingConfirmedAt: new Date(),
    },
  });

  revalidatePath("/pos");
  revalidatePath("/caja");
  return shift;
}

async function computeExpectedCash(
  tx: Prisma.TransactionClient,
  shiftId: string,
  openingCash: number
) {
  const [cashSales, retiros, ingresos] = await Promise.all([
    tx.salePayment.aggregate({
      where: { method: "EFECTIVO", sale: { shiftId } },
      _sum: { amount: true },
    }),
    tx.cashMovement.aggregate({
      where: { shiftId, type: "RETIRO" },
      _sum: { amount: true },
    }),
    tx.cashMovement.aggregate({
      where: { shiftId, type: "INGRESO" },
      _sum: { amount: true },
    }),
  ]);

  const cashSalesTotal = cashSales._sum.amount?.toNumber() ?? 0;
  const retirosTotal = retiros._sum.amount?.toNumber() ?? 0;
  const ingresosTotal = ingresos._sum.amount?.toNumber() ?? 0;

  return {
    cashSalesTotal,
    retirosTotal,
    ingresosTotal,
    expectedCash: openingCash + cashSalesTotal - retirosTotal + ingresosTotal,
  };
}

export async function previewShiftClose(shiftId: string) {
  const shift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const openingCash = shift.openingCash.toNumber();
  const { cashSalesTotal, retirosTotal, ingresosTotal, expectedCash } =
    await computeExpectedCash(prisma, shiftId, openingCash);

  return { openingCash, cashSalesTotal, retirosTotal, ingresosTotal, expectedCash };
}

export type CloseShiftInput = {
  shiftId: string;
  cashierId: string;
  closingCash: number;
  differenceReason?: string;
  confirmingPin: string;
};

export async function closeShift(input: CloseShiftInput) {
  if (input.cashierId !== (await getSessionEmployeeId())) {
    throw new Error("El cajero no coincide con la sesión activa.");
  }

  await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift || shift.status !== "ABIERTO") {
      throw new Error("No hay un turno abierto válido para cerrar.");
    }

    const openingCash = shift.openingCash.toNumber();
    const { expectedCash } = await computeExpectedCash(tx, input.shiftId, openingCash);
    const cashDifference = input.closingCash - expectedCash;

    if (Math.abs(cashDifference) > 0.01 && !input.differenceReason?.trim()) {
      throw new Error(
        "Hay una diferencia entre el efectivo contado y el esperado — captura el motivo."
      );
    }

    const confirmingEmployee = await verifyConfirmingEmployee(
      input.confirmingPin,
      input.cashierId,
      shift.branchId,
      "CAJA_CERRAR"
    );

    await tx.shift.update({
      where: { id: input.shiftId },
      data: {
        status: "CERRADO",
        closedAt: new Date(),
        closingCash: input.closingCash,
        expectedCash,
        cashDifference,
        differenceReason: input.differenceReason?.trim() || null,
        cashierConfirmedAt: new Date(),
        closingConfirmedById: confirmingEmployee.id,
        closingConfirmedAt: new Date(),
      },
    });
  });

  revalidatePath("/pos");
  revalidatePath("/caja");
}
