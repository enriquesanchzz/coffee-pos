import type { PaymentMethod, Prisma, SaleOrderType, SaleStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";

// Módulo Ventas (Administración): listado de todas las ventas con filtros
// y métricas del periodo. A diferencia de Reportes → Estadísticas (solo
// agregados de ventas cobradas), aquí se ve venta por venta, incluidas
// canceladas y cuentas abiertas.

export const SALES_PAGE_SIZE = 50;

export type SalesFilters = {
  from: Date;
  to: Date;
  status?: SaleStatus;
  method?: PaymentMethod;
  employeeId?: string;
  orderType?: SaleOrderType;
  // Folio (últimos caracteres del id), cliente o mesa/referencia.
  q?: string;
  page: number;
};

// Filtros comunes a listado y métricas — el estado solo acota el listado:
// las métricas siempre separan cobradas vs canceladas del mismo conjunto.
function baseWhere(f: SalesFilters): Prisma.SaleWhereInput {
  const q = f.q?.trim();
  return {
    branchId: DEFAULT_BRANCH_ID,
    createdAt: { gte: f.from, lte: f.to },
    ...(f.employeeId ? { employeeId: f.employeeId } : {}),
    ...(f.orderType ? { orderType: f.orderType } : {}),
    ...(f.method ? { payments: { some: { method: f.method } } } : {}),
    ...(q
      ? {
          OR: [
            { id: { endsWith: q.toLowerCase() } },
            { tableNumber: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export type SalesListRow = {
  id: string;
  folio: string;
  createdAt: Date;
  status: SaleStatus;
  orderType: SaleOrderType;
  tableNumber: string | null;
  customerName: string | null;
  employeeName: string;
  itemCount: number;
  total: number;
  tipAmount: number;
  methods: PaymentMethod[];
};

export type SalesMetrics = {
  completedCount: number;
  completedTotal: number;
  averageTicket: number;
  tipsTotal: number;
  discountTotal: number;
  byMethod: Record<PaymentMethod, number>;
  cancelledCount: number;
  cancelledTotal: number;
  openCount: number;
  openTotal: number;
};

export function saleFolio(id: string) {
  return id.slice(-8).toUpperCase();
}

export async function getSalesPage(f: SalesFilters): Promise<{
  rows: SalesListRow[];
  totalRows: number;
  pageCount: number;
  metrics: SalesMetrics;
}> {
  const base = baseWhere(f);
  const listWhere: Prisma.SaleWhereInput = { ...base, ...(f.status ? { status: f.status } : {}) };

  const [sales, totalRows, completed, cancelled, open, byMethodRows] = await Promise.all([
    prisma.sale.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * SALES_PAGE_SIZE,
      take: SALES_PAGE_SIZE,
      include: {
        employee: { select: { name: true } },
        customer: { select: { name: true } },
        payments: { select: { method: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.sale.count({ where: listWhere }),
    prisma.sale.aggregate({
      where: { ...base, status: "COMPLETADA" },
      _count: true,
      _sum: { total: true, tipAmount: true, discountTotal: true },
    }),
    prisma.sale.aggregate({ where: { ...base, status: "CANCELADA" }, _count: true, _sum: { total: true } }),
    prisma.sale.aggregate({ where: { ...base, status: "ABIERTA" }, _count: true, _sum: { total: true } }),
    prisma.salePayment.groupBy({
      by: ["method"],
      where: { sale: { ...base, status: "COMPLETADA" } },
      _sum: { amount: true },
    }),
  ]);

  const byMethod: Record<PaymentMethod, number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  for (const row of byMethodRows) byMethod[row.method] = row._sum.amount?.toNumber() ?? 0;

  const completedTotal = completed._sum.total?.toNumber() ?? 0;
  return {
    rows: sales.map((s) => ({
      id: s.id,
      folio: saleFolio(s.id),
      createdAt: s.createdAt,
      status: s.status,
      orderType: s.orderType,
      tableNumber: s.tableNumber,
      customerName: s.customer?.name ?? null,
      employeeName: s.employee.name,
      itemCount: s._count.items,
      total: s.total.toNumber(),
      tipAmount: s.tipAmount.toNumber(),
      methods: Array.from(new Set(s.payments.map((p) => p.method))),
    })),
    totalRows,
    pageCount: Math.max(1, Math.ceil(totalRows / SALES_PAGE_SIZE)),
    metrics: {
      completedCount: completed._count,
      completedTotal,
      averageTicket: completed._count === 0 ? 0 : completedTotal / completed._count,
      tipsTotal: completed._sum.tipAmount?.toNumber() ?? 0,
      discountTotal: completed._sum.discountTotal?.toNumber() ?? 0,
      byMethod,
      cancelledCount: cancelled._count,
      cancelledTotal: cancelled._sum.total?.toNumber() ?? 0,
      openCount: open._count,
      openTotal: open._sum.total?.toNumber() ?? 0,
    },
  };
}

export async function getSalesEmployees() {
  return prisma.employee.findMany({
    where: { sales: { some: { branchId: DEFAULT_BRANCH_ID } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// Lo que el detalle agrega a getSaleReceiptDetail (lib/receipt.ts): quién
// y por qué se anuló, el descuento aplicado y si todavía se puede anular.
export type SaleAdminExtras = {
  shiftId: string;
  shiftOpen: boolean;
  subtotal: number;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  discountCode: string | null;
  manualDiscountReason: string | null;
  manualDiscountAuthorizedBy: string | null;
  payments: { method: PaymentMethod; amount: number; tipAmount: number; note: string | null }[];
};

export async function getSaleAdminExtras(saleId: string): Promise<SaleAdminExtras> {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      shift: { select: { status: true } },
      discountCode: { select: { code: true } },
      manualDiscount: true,
      payments: { orderBy: { id: "asc" } },
    },
  });
  const [cancelledBy, authorizer] = await Promise.all([
    sale.cancelledById ? prisma.employee.findUnique({ where: { id: sale.cancelledById }, select: { name: true } }) : null,
    sale.manualDiscount
      ? prisma.employee.findUnique({ where: { id: sale.manualDiscount.authorizedById }, select: { name: true } })
      : null,
  ]);
  return {
    shiftId: sale.shiftId,
    shiftOpen: sale.shift.status === "ABIERTO",
    subtotal: sale.subtotal.toNumber(),
    cancelledAt: sale.cancelledAt,
    cancelledByName: cancelledBy?.name ?? null,
    cancelReason: sale.cancelReason,
    discountCode: sale.discountCode?.code ?? null,
    manualDiscountReason: sale.manualDiscount?.reason ?? null,
    manualDiscountAuthorizedBy: authorizer?.name ?? null,
    payments: sale.payments.map((p) => ({
      method: p.method,
      amount: p.amount.toNumber(),
      tipAmount: p.tipAmount.toNumber(),
      note: p.note,
    })),
  };
}
