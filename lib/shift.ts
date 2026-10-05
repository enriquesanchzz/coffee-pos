import { prisma } from "./prisma";

export type ShiftCashMovement = {
  id: string;
  type: string;
  amount: number;
  reason: string;
  employeeName: string;
  createdAt: string;
};

// Ventas del turno para la lista de Caja (desde donde se anulan) — las
// cobradas y las cuentas de Mesa todavía abiertas.
export type ShiftSaleRow = {
  id: string;
  status: "COMPLETADA" | "ABIERTA";
  createdAt: string;
  orderType: string;
  tableNumber: string | null;
  total: number;
  tipAmount: number;
  employeeName: string;
  paymentMethods: string[];
};

export type ShiftDetail = {
  id: string;
  branchId: string;
  type: string;
  openingCash: number;
  openedAt: string;
  cashierName: string;
  salesCount: number;
  salesTotal: number;
  sales: ShiftSaleRow[];
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
      sales: {
        where: { status: { in: ["COMPLETADA", "ABIERTA"] } },
        include: { employee: true, payments: true },
        orderBy: { createdAt: "desc" },
      },
      cashMovements: {
        include: { employee: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const completed = shift.sales.filter((sale) => sale.status === "COMPLETADA");

  return {
    id: shift.id,
    branchId: shift.branchId,
    type: shift.type,
    openingCash: shift.openingCash.toNumber(),
    openedAt: shift.openedAt.toISOString(),
    cashierName: shift.cashier.name,
    salesCount: completed.length,
    salesTotal: completed.reduce((sum, sale) => sum + sale.total.toNumber(), 0),
    sales: shift.sales.map((sale) => ({
      id: sale.id,
      status: sale.status as "COMPLETADA" | "ABIERTA",
      createdAt: sale.createdAt.toISOString(),
      orderType: sale.orderType,
      tableNumber: sale.tableNumber,
      total: sale.total.toNumber(),
      tipAmount: sale.tipAmount.toNumber(),
      employeeName: sale.employee.name,
      paymentMethods: [...new Set(sale.payments.map((p) => p.method))],
    })),
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
