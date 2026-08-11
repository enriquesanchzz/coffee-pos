import { prisma } from "./prisma";

export type ShiftCashMovement = {
  id: string;
  type: string;
  amount: number;
  reason: string;
  employeeName: string;
  createdAt: string;
};

export type ShiftDetail = {
  id: string;
  type: string;
  openingCash: number;
  openedAt: string;
  cashierName: string;
  salesCount: number;
  salesTotal: number;
  cashMovements: ShiftCashMovement[];
};

// Resumen del turno abierto para pintar la pantalla de Caja: fondo inicial,
// ventas registradas y movimientos de efectivo hasta ahora. El efectivo
// esperado del corte se calcula aparte (`previewShiftClose` en
// `actions/shift.ts`), solo al momento de cerrar — no aquí.
export async function getShiftDetail(shiftId: string): Promise<ShiftDetail> {
  const shift = await prisma.shift.findUniqueOrThrow({
    where: { id: shiftId },
    include: {
      cashier: true,
      sales: { where: { status: "COMPLETADA" } },
      cashMovements: {
        include: { employee: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return {
    id: shift.id,
    type: shift.type,
    openingCash: shift.openingCash.toNumber(),
    openedAt: shift.openedAt.toISOString(),
    cashierName: shift.cashier.name,
    salesCount: shift.sales.length,
    salesTotal: shift.sales.reduce((sum, sale) => sum + sale.total.toNumber(), 0),
    cashMovements: shift.cashMovements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amount: movement.amount.toNumber(),
      reason: movement.reason,
      employeeName: movement.employee.name,
      createdAt: movement.createdAt.toISOString(),
    })),
  };
}
