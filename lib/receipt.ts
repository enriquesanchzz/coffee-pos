import type { PaymentMethod, SaleOrderType, SaleStatus, ShiftType } from "@prisma/client";
import { prisma } from "./prisma";
import { unitLabel } from "./utils";

// Datos para los tickets imprimibles (venta, apertura y cierre de caja) —
// antes el sistema no generaba ninguno (QA de octubre 2026). Vive en lib/
// porque lo consumen Server Components (las páginas de impresión), no
// Server Actions — no hay mutación, solo lectura.

export type SaleReceiptItem = {
  id: string;
  productName: string;
  variantName: string;
  comboName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifierNames: string[];
  extraNames: string[];
  notes: string | null;
};

export type SaleReceiptDetail = {
  id: string;
  createdAt: Date;
  status: SaleStatus;
  orderType: SaleOrderType;
  tableNumber: string | null;
  employeeName: string;
  customerName: string | null;
  items: SaleReceiptItem[];
  subtotal: number;
  discountTotal: number;
  tipAmount: number;
  taxAmount: number;
  total: number;
  payments: { method: PaymentMethod; amount: number; note: string | null }[];
};

export async function getSaleReceiptDetail(saleId: string): Promise<SaleReceiptDetail> {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      employee: true,
      customer: true,
      payments: true,
      items: {
        include: {
          productVariant: { include: { product: true } },
          combo: true,
          modifiers: { include: { modifierOption: true } },
          ingredientAdjustments: { include: { ingredient: true } },
        },
      },
    },
  });

  return {
    id: sale.id,
    createdAt: sale.createdAt,
    status: sale.status,
    orderType: sale.orderType,
    tableNumber: sale.tableNumber,
    employeeName: sale.employee.name,
    customerName: sale.customer?.name ?? null,
    items: sale.items.map((item) => ({
      id: item.id,
      productName: item.productVariant?.product.name ?? "(producto eliminado)",
      variantName: item.productVariant?.name ?? "",
      comboName: item.combo?.name ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      lineTotal: item.lineTotal.toNumber(),
      modifierNames: item.modifiers.map((m) => m.modifierOption.name),
      extraNames: item.ingredientAdjustments.map(
        (a) => `${a.ingredient.name} (${a.quantity.toNumber()} ${unitLabel(a.unit)})`
      ),
      notes: item.notes,
    })),
    subtotal: sale.subtotal.toNumber(),
    discountTotal: sale.discountTotal.toNumber(),
    tipAmount: sale.tipAmount.toNumber(),
    taxAmount: sale.taxAmount.toNumber(),
    total: sale.total.toNumber(),
    payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount.toNumber(), note: p.note })),
  };
}

export type ShiftTicketData = {
  id: string;
  branchId: string;
  type: ShiftType;
  status: "ABIERTO" | "CERRADO";
  openedAt: Date;
  closedAt: Date | null;
  cashierName: string;
  openingConfirmedByName: string | null;
  closingConfirmedByName: string | null;
  openingCash: number;
  // Lo demás solo aplica una vez cerrado — null mientras el turno sigue
  // abierto (el comprobante de apertura no lo necesita).
  closingCash: number | null;
  expectedCash: number | null;
  cashDifference: number | null;
  differenceReason: string | null;
  salesTotal: number;
  tipsTotal: number;
  paymentsByMethod: Record<PaymentMethod, number>;
  retirosTotal: number;
  ingresosTotal: number;
};

export async function getShiftTicketData(shiftId: string): Promise<ShiftTicketData> {
  const shift = await prisma.shift.findUniqueOrThrow({
    where: { id: shiftId },
    include: { cashier: true, openingConfirmedBy: true, closingConfirmedBy: true },
  });

  const [sales, paymentsByMethodRows, retiros, ingresos] = await Promise.all([
    prisma.sale.aggregate({
      where: { shiftId, status: "COMPLETADA" },
      _sum: { total: true, tipAmount: true },
    }),
    prisma.salePayment.groupBy({
      by: ["method"],
      where: { sale: { shiftId, status: "COMPLETADA" } },
      _sum: { amount: true },
    }),
    prisma.cashMovement.aggregate({ where: { shiftId, type: "RETIRO" }, _sum: { amount: true } }),
    prisma.cashMovement.aggregate({ where: { shiftId, type: "INGRESO" }, _sum: { amount: true } }),
  ]);

  const paymentsByMethod: Record<PaymentMethod, number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  for (const row of paymentsByMethodRows) {
    paymentsByMethod[row.method] = row._sum.amount?.toNumber() ?? 0;
  }

  return {
    id: shift.id,
    branchId: shift.branchId,
    type: shift.type,
    status: shift.status === "ABIERTO" ? "ABIERTO" : "CERRADO",
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    cashierName: shift.cashier.name,
    openingConfirmedByName: shift.openingConfirmedBy?.name ?? null,
    closingConfirmedByName: shift.closingConfirmedBy?.name ?? null,
    openingCash: shift.openingCash.toNumber(),
    closingCash: shift.closingCash?.toNumber() ?? null,
    expectedCash: shift.expectedCash?.toNumber() ?? null,
    cashDifference: shift.cashDifference?.toNumber() ?? null,
    differenceReason: shift.differenceReason,
    salesTotal: sales._sum.total?.toNumber() ?? 0,
    tipsTotal: sales._sum.tipAmount?.toNumber() ?? 0,
    paymentsByMethod,
    retirosTotal: retiros._sum.amount?.toNumber() ?? 0,
    ingresosTotal: ingresos._sum.amount?.toNumber() ?? 0,
  };
}
