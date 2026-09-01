import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";

export type SupplierListItem = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  ingredientCount: number;
};

export async function getSuppliers(): Promise<SupplierListItem[]> {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { ingredientLinks: true },
  });

  return suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    contact: supplier.contact,
    phone: supplier.phone,
    email: supplier.email,
    isActive: supplier.isActive,
    ingredientCount: supplier.ingredientLinks.length,
  }));
}

export type SupplierIngredientLink = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  cost: number;
  costUnit: string;
  isSelected: boolean;
};

export type SupplierDetail = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  minOrderAmount: number | null;
  ingredientLinks: SupplierIngredientLink[];
};

export async function getSupplierDetail(id: string): Promise<SupplierDetail> {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id },
    include: {
      ingredientLinks: {
        include: { ingredient: true },
        orderBy: { ingredient: { name: "asc" } },
      },
    },
  });

  return {
    id: supplier.id,
    name: supplier.name,
    contact: supplier.contact,
    phone: supplier.phone,
    email: supplier.email,
    isActive: supplier.isActive,
    minOrderAmount: supplier.minOrderAmount?.toNumber() ?? null,
    ingredientLinks: supplier.ingredientLinks.map((link) => ({
      id: link.id,
      ingredientId: link.ingredientId,
      ingredientName: link.ingredient.name,
      baseUnit: link.ingredient.baseUnit,
      cost: link.cost.toNumber(),
      costUnit: link.costUnit,
      isSelected: link.isSelected,
    })),
  };
}

export type ActiveSupplierOption = { id: string; name: string };

export async function getActiveSuppliers(): Promise<ActiveSupplierOption[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }));
}

export type IngredientOption = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  tracksExpiration: boolean;
};

export async function getIngredientOptions(): Promise<IngredientOption[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    category: ingredient.category,
    baseUnit: ingredient.baseUnit,
    tracksExpiration: ingredient.tracksExpiration,
  }));
}

// supplierId -> ingredientId -> costo cotizado, para autocompletar el costo
// estimado al armar una orden nueva.
export async function getSupplierCostMap(): Promise<Record<string, Record<string, number>>> {
  const links = await prisma.ingredientSupplier.findMany();
  const map: Record<string, Record<string, number>> = {};
  for (const link of links) {
    map[link.supplierId] ??= {};
    map[link.supplierId][link.ingredientId] = link.cost.toNumber();
  }
  return map;
}

export type PurchaseOrderListItem = {
  id: string;
  supplierName: string;
  status: string;
  createdAt: string;
  itemCount: number;
  estimatedTotal: number;
};

export async function getPurchaseOrders(): Promise<PurchaseOrderListItem[]> {
  const orders = await prisma.purchaseOrder.findMany({
    where: { branchId: DEFAULT_BRANCH_ID },
    orderBy: { createdAt: "desc" },
    include: { supplier: true, items: true },
  });

  return orders.map((order) => ({
    id: order.id,
    supplierName: order.supplier.name,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    itemCount: order.items.length,
    estimatedTotal: order.items.reduce(
      (sum, item) => sum + item.orderedQuantity.toNumber() * item.estimatedUnitCost.toNumber(),
      0
    ),
  }));
}

export type PurchaseOrderItemDetail = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  tracksExpiration: boolean;
  orderedQuantity: number;
  receivedQuantity: number | null;
  unit: string;
  estimatedUnitCost: number;
  actualUnitCost: number | null;
};

export type PurchaseOrderDetail = {
  id: string;
  status: string;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  receivedAt: string | null;
  items: PurchaseOrderItemDetail[];
};

export async function getPurchaseOrderDetail(id: string): Promise<PurchaseOrderDetail> {
  const order = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { supplier: true, items: { include: { ingredient: true } } },
  });

  return {
    id: order.id,
    status: order.status,
    supplierId: order.supplierId,
    supplierName: order.supplier.name,
    createdAt: order.createdAt.toISOString(),
    receivedAt: order.receivedAt?.toISOString() ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredient.name,
      tracksExpiration: item.ingredient.tracksExpiration,
      orderedQuantity: item.orderedQuantity.toNumber(),
      receivedQuantity: item.receivedQuantity?.toNumber() ?? null,
      unit: item.unit,
      estimatedUnitCost: item.estimatedUnitCost.toNumber(),
      actualUnitCost: item.actualUnitCost?.toNumber() ?? null,
    })),
  };
}
