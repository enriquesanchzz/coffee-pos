import { prisma } from "./prisma";
import { getLoyaltySummary, PROGRAM_LABELS, type LoyaltyProgramSummary } from "./loyalty-points";
import { couponLabel, COUPON_LABEL_INCLUDE } from "./coupon-label";
import { matchesSearch } from "./search";

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  // Resumen corto de puntos, ej. "Cafetería 45 pts · Fiel / Pet Shop 3 pts".
  loyaltyLine: string;
};

function loyaltyLine(summary: LoyaltyProgramSummary[]) {
  return summary
    .map((p) => `${summary.length > 1 ? `${p.label} ` : ""}${p.points} pts${p.tier ? ` · ${p.tier.name}` : ""}`)
    .join(" / ");
}

// Búsqueda (sin acentos, por nombre/teléfono/email/código de tarjeta) y
// paginación para la lista de Clientes (QA-020). Se filtra en memoria con
// matchesSearch para ignorar acentos sin depender de la extensión unaccent
// de Postgres — a la escala de un café (cientos/miles de clientes) basta.
export const CUSTOMERS_PAGE_SIZE = 25;

export async function getCustomers(
  { query = "", page = 1 }: { query?: string; page?: number } = {}
): Promise<{ items: CustomerListItem[]; total: number; page: number; pageCount: number }> {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { loyaltyCard: { include: { tier: true } } },
  });

  const digits = query.replace(/\D/g, "");
  const filtered = query.trim()
    ? customers.filter(
        (c) =>
          matchesSearch(query, c.name, c.email) ||
          (digits.length >= 3 && c.phone?.includes(digits)) ||
          c.loyaltyCard?.code === query.trim()
      )
    : customers;

  const pageCount = Math.max(1, Math.ceil(filtered.length / CUSTOMERS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const items = filtered.slice((safePage - 1) * CUSTOMERS_PAGE_SIZE, safePage * CUSTOMERS_PAGE_SIZE);

  return {
    total: filtered.length,
    page: safePage,
    pageCount,
    items: await Promise.all(
      items.map(async (customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        loyaltyLine: loyaltyLine(await getLoyaltySummary(prisma, customer.id)),
      }))
    ),
  };
}

export type CustomerSaleHistoryItem = {
  id: string;
  createdAt: string;
  total: number;
  status: string;
};

export type CustomerTopProduct = {
  productVariantId: string;
  productName: string;
  variantName: string;
  quantityPurchased: number;
};

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthDate: string | null;
  gender: string | null;
  loyalty: LoyaltyProgramSummary[];
  // Todos los cupones personales (bienvenida, recompensas, cumpleaños).
  coupons: { code: string; label: string; status: "disponible" | "usado" | "vencido" | "inactivo" }[];
  pointsHistory: { id: string; createdAt: string; label: string; points: number; reason: string }[];
  // Para las acciones de lealtad del detalle (ver tarjeta, reenviar por
  // WhatsApp) y el estado del cupón de bienvenida (QA-020).
  loyaltyCode: string | null;
  welcomeCoupon: { code: string; used: boolean } | null;
  sales: CustomerSaleHistoryItem[];
  topProducts: CustomerTopProduct[];
};

export async function getCustomerDetail(id: string): Promise<CustomerDetail> {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id },
    include: {
      loyaltyCard: { include: { tier: true } },
      discountCodes: { include: COUPON_LABEL_INCLUDE, orderBy: { id: "desc" } },
      loyaltyEntries: { orderBy: { createdAt: "desc" }, take: 30 },
      sales: { where: { status: "COMPLETADA" }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  // Top productos sobre TODO el historial de compras completadas (no solo
  // las últimas 20 que se muestran arriba) — mismo patrón de agregación en
  // memoria (Map por productVariantId) que getStatsReport (lib/reports.ts),
  // no un groupBy de Prisma, para mantener el mismo estilo del archivo.
  const completedSales = await prisma.sale.findMany({
    where: { customerId: id, status: "COMPLETADA" },
    include: { items: { include: { productVariant: { include: { product: true } } } } },
  });

  const byVariant = new Map<string, CustomerTopProduct>();
  for (const sale of completedSales) {
    for (const item of sale.items) {
      if (!item.productVariantId || !item.productVariant) continue;
      const entry = byVariant.get(item.productVariantId) ?? {
        productVariantId: item.productVariantId,
        productName: item.productVariant.product.name,
        variantName: item.productVariant.name,
        quantityPurchased: 0,
      };
      entry.quantityPurchased += item.quantity;
      byVariant.set(item.productVariantId, entry);
    }
  }
  const topProducts = Array.from(byVariant.values())
    .sort((a, b) => b.quantityPurchased - a.quantityPurchased)
    .slice(0, 10);

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    birthDate: customer.birthDate?.toISOString() ?? null,
    gender: customer.gender,
    loyalty: await getLoyaltySummary(prisma, customer.id),
    coupons: customer.discountCodes.map((c) => ({
      code: c.code,
      label: couponLabel(c),
      status: !c.isActive
        ? "inactivo"
        : c.usedAt && !c.isReusable
          ? "usado"
          : c.expiresAt && c.expiresAt < new Date()
            ? "vencido"
            : "disponible",
    })),
    pointsHistory: customer.loyaltyEntries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      label: PROGRAM_LABELS[e.program],
      points: e.points,
      reason: e.reason,
    })),
    loyaltyCode: customer.loyaltyCard?.code ?? null,
    welcomeCoupon: (() => {
      const welcome = customer.discountCodes.find((c) => c.code.startsWith("BIENVENIDA-"));
      return welcome ? { code: welcome.code, used: welcome.usedAt !== null } : null;
    })(),
    sales: customer.sales.map((sale) => ({
      id: sale.id,
      createdAt: sale.createdAt.toISOString(),
      total: sale.total.toNumber(),
      status: sale.status,
    })),
    topProducts,
  };
}

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  loyaltyCode: string | null;
  // updateCustomer() ya es parcial (un campo omitido se conserva), así que
  // ya no hace falta reenviarlos; se siguen cargando por si el picker los
  // necesita mostrar.
  birthDate: string | null;
  gender: string | null;
};

export async function getCustomerOptions(): Promise<CustomerOption[]> {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { loyaltyCard: { select: { code: true } } },
  });
  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    loyaltyCode: customer.loyaltyCard?.code ?? null,
    birthDate: customer.birthDate?.toISOString() ?? null,
    gender: customer.gender,
  }));
}

const AGE_BUCKETS = ["Menor de 18", "18-25", "26-35", "36-45", "46-55", "56+"] as const;
const NO_DATA_BUCKET = "Sin dato";

function ageBucket(birthDate: Date | null): string {
  if (!birthDate) return NO_DATA_BUCKET;
  const ageMs = Date.now() - birthDate.getTime();
  const age = Math.floor(ageMs / (1000 * 60 * 60 * 24 * 365.25));
  if (age < 18) return AGE_BUCKETS[0];
  if (age <= 25) return AGE_BUCKETS[1];
  if (age <= 35) return AGE_BUCKETS[2];
  if (age <= 45) return AGE_BUCKETS[3];
  if (age <= 55) return AGE_BUCKETS[4];
  return AGE_BUCKETS[5];
}

const GENDER_LABELS: Record<string, string> = {
  FEMENINO: "Femenino",
  MASCULINO: "Masculino",
  OTRO: "Otro",
};

export type CustomerDemographics = {
  totalCustomers: number;
  byAgeBucket: { bucket: string; count: number }[];
  byGender: { label: string; count: number }[];
};

// Agregación en memoria (mismo estilo que lib/reports.ts) sobre
// Customer.birthDate/gender — ambos opcionales, los clientes sin dato caen
// en su propio bucket ("Sin dato") en vez de excluirse, para que el total
// siempre cuadre con totalCustomers.
export async function getCustomerDemographics(): Promise<CustomerDemographics> {
  const customers = await prisma.customer.findMany({
    select: { birthDate: true, gender: true },
  });

  const byAgeBucket = new Map<string, number>();
  const byGender = new Map<string, number>();

  for (const customer of customers) {
    const ageKey = ageBucket(customer.birthDate);
    byAgeBucket.set(ageKey, (byAgeBucket.get(ageKey) ?? 0) + 1);

    const genderKey = customer.gender ? (GENDER_LABELS[customer.gender] ?? customer.gender) : "Sin dato";
    byGender.set(genderKey, (byGender.get(genderKey) ?? 0) + 1);
  }

  const bucketOrder = [...AGE_BUCKETS, NO_DATA_BUCKET];

  return {
    totalCustomers: customers.length,
    byAgeBucket: bucketOrder
      .filter((bucket) => byAgeBucket.has(bucket))
      .map((bucket) => ({ bucket, count: byAgeBucket.get(bucket)! })),
    byGender: Array.from(byGender.entries()).map(([label, count]) => ({ label, count })),
  };
}
