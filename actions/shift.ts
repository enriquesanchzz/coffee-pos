"use server";

import { safeAction } from "@/lib/safe-action";
import { assertMoney } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { Permission, PaymentMethod, Prisma, ShiftType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findEmployeeByPin, getSessionEmployeeId, assertSessionEmployee, SessionExpiredError } from "@/lib/session";
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

export const openShift = safeAction(async function openShift(input: OpenShiftInput) {
  await assertSessionEmployee(input.cashierId);
  // El navegador ya lo impide con min=0, pero el servidor no debe confiar
  // en eso (QA-022).
  assertMoney(input.openingCash, "El fondo de caja inicial", { max: 100_000 });

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
});

async function computeExpectedCash(
  tx: Prisma.TransactionClient,
  shiftId: string,
  openingCash: number
) {
  const [sales, cashSales, paymentsByMethodRows, retiros, ingresos] = await Promise.all([
    tx.sale.aggregate({
      where: { shiftId, status: "COMPLETADA" },
      _sum: { total: true, tipAmount: true },
    }),
    tx.salePayment.aggregate({
      where: { method: "EFECTIVO", sale: { shiftId, status: "COMPLETADA" } },
      _sum: { amount: true },
    }),
    tx.salePayment.groupBy({
      by: ["method"],
      where: { sale: { shiftId, status: "COMPLETADA" } },
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

  const paymentsByMethod: Record<PaymentMethod, number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  for (const row of paymentsByMethodRows) {
    paymentsByMethod[row.method] = row._sum.amount?.toNumber() ?? 0;
  }

  return {
    salesTotal: sales._sum.total?.toNumber() ?? 0,
    tipsTotal: sales._sum.tipAmount?.toNumber() ?? 0,
    cashSalesTotal,
    paymentsByMethod,
    retirosTotal,
    ingresosTotal,
    expectedCash: openingCash + cashSalesTotal - retirosTotal + ingresosTotal,
  };
}

export const previewShiftClose = safeAction(async function previewShiftClose(shiftId: string) {
  // Expone los totales de caja del turno — solo para una sesión activa.
  if (!(await getSessionEmployeeId())) {
    throw new SessionExpiredError("Necesitas iniciar sesión para ver el corte de caja.");
  }
  const shift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const openingCash = shift.openingCash.toNumber();
  const {
    salesTotal,
    tipsTotal,
    cashSalesTotal,
    paymentsByMethod,
    retirosTotal,
    ingresosTotal,
    expectedCash,
  } = await computeExpectedCash(prisma, shiftId, openingCash);

  return {
    openingCash,
    salesTotal,
    tipsTotal,
    cashSalesTotal,
    paymentsByMethod,
    retirosTotal,
    ingresosTotal,
    expectedCash,
  };
});

export type CloseShiftInput = {
  shiftId: string;
  cashierId: string;
  closingCash: number;
  differenceReason?: string;
  confirmingPin: string;
};

export const closeShift = safeAction(async function closeShift(input: CloseShiftInput) {
  await assertSessionEmployee(input.cashierId);

  await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift || shift.status !== "ABIERTO") {
      throw new Error("No hay un turno abierto válido para cerrar.");
    }

    // Cuentas de Mesa dejadas abiertas (ver actions/pos.ts openTab) —
    // hay que cobrarlas o decidir qué hacer con ellas antes de cerrar el
    // turno, no se pueden arrastrar a otro turno en silencio.
    const openTabsCount = await tx.sale.count({ where: { shiftId: input.shiftId, status: "ABIERTA" } });
    if (openTabsCount > 0) {
      throw new Error(
        `Hay ${openTabsCount === 1 ? "1 cuenta abierta" : `${openTabsCount} cuentas abiertas`} sin cobrar en este turno — cóbralas o anúlalas (Caja → Ventas del turno) antes de cerrar el turno.`
      );
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
});
