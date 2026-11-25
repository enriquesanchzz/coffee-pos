import type { PaymentMethod, Prisma, SaleOrderType, SaleStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";
import { resolveDateRange } from "./reports";

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

export type SalesSearchParams = {
  from?: string;
  to?: string;
  status?: string;
  method?: string;
  employee?: string;
  orderType?: string;
  q?: string;
  page?: string;
};

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

// Lee los filtros de la URL. Lo comparten el listado y la exportación a CSV
// para que el archivo traiga exactamente lo que se ve en pantalla.
// `query` son los filtros normalizados (sin página) para armar enlaces.
export function parseSalesParams(params: SalesSearchParams): { filters: SalesFilters; query: URLSearchParams } {
  const { from, to, fromStr, toStr } = resolveDateRange(params.from, params.to);
  const status = pick(params.status, ["COMPLETADA", "CANCELADA", "ABIERTA"] as const);
  const method = pick(params.method, ["EFECTIVO", "TARJETA", "TRANSFERENCIA"] as const);
  const orderType = pick(params.orderType, ["CONSUMO_LOCAL", "PARA_LLEVAR", "DOMICILIO"] as const);
  const employeeId = params.employee || undefined;
  const q = params.q?.trim() || undefined;
  const page = Math.max(1, Math.floor(Number(params.page) || 1));

  const query = new URLSearchParams();
  query.set("from", fromStr);
  query.set("to", toStr);
  if (status) query.set("status", status);
  if (method) query.set("method", method);
  if (employeeId) query.set("employee", employeeId);
  if (orderType) query.set("orderType", orderType);
  if (q) query.set("q", q);

  return { filters: { from, to, status, method, employeeId, orderType, q, page }, query };
}

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

// Exportación a CSV: todas las ventas que cumplen los filtros (sin paginar),
// una fila por venta. El tope evita que un rango enorme tumbe el servidor.
export const SALES_EXPORT_LIMIT = 20000;

export type SalesExportRow = {
  folio: string;
  createdAt: Date;
  status: SaleStatus;
  orderType: SaleOrderType;
  tableNumber: string | null;
  customerName: string | null;
  employeeName: string;
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  total: number;
  tipAmount: number;
  byMethod: Record<PaymentMethod, number>;
  discountCode: string | null;
  cancelReason: string | null;
};

export async function getSalesForExport(f: SalesFilters): Promise<{ rows: SalesExportRow[]; truncated: boolean }> {
  const where: Prisma.SaleWhereInput = { ...baseWhere(f), ...(f.status ? { status: f.status } : {}) };
  const sales = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: SALES_EXPORT_LIMIT + 1,
    include: {
      employee: { select: { name: true } },
      customer: { select: { name: true } },
      discountCode: { select: { code: true } },
      payments: { select: { method: true, amount: true } },
      items: { select: { quantity: true } },
    },
  });
  const truncated = sales.length > SALES_EXPORT_LIMIT;
  return {
    truncated,
    rows: sales.slice(0, SALES_EXPORT_LIMIT).map((s) => {
      const byMethod: Record<PaymentMethod, number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 };
      for (const p of s.payments) byMethod[p.method] += p.amount.toNumber();
      return {
        folio: saleFolio(s.id),
        createdAt: s.createdAt,
        status: s.status,
        orderType: s.orderType,
        tableNumber: s.tableNumber,
        customerName: s.customer?.name ?? null,
        employeeName: s.employee.name,
        itemCount: s.items.reduce((sum, i) => sum + i.quantity, 0),
        subtotal: s.subtotal.toNumber(),
        discountTotal: s.discountTotal.toNumber(),
        taxAmount: s.taxAmount.toNumber(),
        total: s.total.toNumber(),
        tipAmount: s.tipAmount.toNumber(),
        byMethod,
        discountCode: s.discountCode?.code ?? null,
        cancelReason: s.cancelReason,
      };
    }),
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
