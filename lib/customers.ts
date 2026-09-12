import { prisma } from "./prisma";

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stamps: number;
  tierName: string | null;
};

export async function getCustomers(): Promise<CustomerListItem[]> {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { loyaltyCard: { include: { tier: true } } },
  });

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    stamps: customer.loyaltyCard?.stamps ?? 0,
    tierName: customer.loyaltyCard?.tier?.name ?? null,
  }));
}

export type CustomerSaleHistoryItem = {
  id: string;
  createdAt: string;
  total: number;
  status: string;
};

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  stamps: number;
  tierName: string | null;
  sales: CustomerSaleHistoryItem[];
};

export async function getCustomerDetail(id: string): Promise<CustomerDetail> {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id },
    include: {
      loyaltyCard: { include: { tier: true } },
      sales: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    birthDate: customer.birthDate?.toISOString() ?? null,
    stamps: customer.loyaltyCard?.stamps ?? 0,
    tierName: customer.loyaltyCard?.tier?.name ?? null,
    sales: customer.sales.map((sale) => ({
      id: sale.id,
      createdAt: sale.createdAt.toISOString(),
      total: sale.total.toNumber(),
      status: sale.status,
    })),
  };
}

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  loyaltyCode: string | null;
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
  }));
}
