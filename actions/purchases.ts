"use server";

import { revalidatePath } from "next/cache";
import type { UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

// No existe un permiso específico de "proveedores" en el catálogo — se usa
// ORDEN_COMPRA_CREAR (el más cercano) para crear/editar proveedor y crear
// orden, COMPRA_REGISTRAR para recibir. Ver docs/CONTINUE.md.

export type CreateSupplierInput = {
  employeeId: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  minOrderAmount?: number;
};

export async function createSupplier(input: CreateSupplierInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");

  const supplier = await prisma.supplier.create({
    data: {
      name,
      contact: input.contact?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      minOrderAmount: input.minOrderAmount || null,
      branchId: null, // proveedor global — no hay razón para atarlo a una sucursal todavía
    },
  });

  revalidatePath("/compras/proveedores");

  return { id: supplier.id };
}

export type UpdateSupplierInput = {
  employeeId: string;
  supplierId: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  minOrderAmount?: number;
};

export async function updateSupplier(input: UpdateSupplierInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");

  await prisma.supplier.update({
    where: { id: input.supplierId },
    data: {
      name,
      contact: input.contact?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      isActive: input.isActive,
      minOrderAmount: input.minOrderAmount || null,
    },
  });

  revalidatePath("/compras/proveedores");
  revalidatePath(`/compras/proveedores/${input.supplierId}`);
}

export type UpsertIngredientSupplierInput = {
  employeeId: string;
  supplierId: string;
  ingredientId: string;
  cost: number;
  costUnit: UnitOfMeasure;
  isSelected: boolean;
  minOrderQuantity?: number;
  minOrderUnit?: UnitOfMeasure;
};

// isSelected marca el costo "activo" de un ingrediente para el cálculo de
// costo de receta (ver comentario en IngredientSupplier del schema) — solo
// un proveedor puede estar seleccionado a la vez por ingrediente.
export async function upsertIngredientSupplier(input: UpsertIngredientSupplierInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.cost <= 0) {
    throw new Error("El costo debe ser mayor a cero.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");

  await prisma.$transaction(async (tx) => {
    if (input.isSelected) {
      await tx.ingredientSupplier.updateMany({
        where: { ingredientId: input.ingredientId },
        data: { isSelected: false },
      });
    }

    await tx.ingredientSupplier.upsert({
      where: {
        ingredientId_supplierId: {
          ingredientId: input.ingredientId,
          supplierId: input.supplierId,
        },
      },
      update: {
        cost: input.cost,
        costUnit: input.costUnit,
        isSelected: input.isSelected,
        minOrderQuantity: input.minOrderQuantity ?? null,
        minOrderUnit: input.minOrderUnit ?? null,
      },
      create: {
        ingredientId: input.ingredientId,
        supplierId: input.supplierId,
        cost: input.cost,
        costUnit: input.costUnit,
        isSelected: input.isSelected,
        minOrderQuantity: input.minOrderQuantity ?? null,
        minOrderUnit: input.minOrderUnit ?? null,
      },
    });
  });

  revalidatePath(`/compras/proveedores/${input.supplierId}`);
}

export type CreatePurchaseOrderLineInput = {
  ingredientId: string;
  quantity: number;
  unit: UnitOfMeasure;
  estimatedUnitCost: number;
};

export type CreatePurchaseOrderInput = {
  employeeId: string;
  supplierId: string;
  lines: CreatePurchaseOrderLineInput[];
};

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (!input.supplierId) {
    throw new Error("Elige un proveedor.");
  }
  if (input.lines.length === 0) {
    throw new Error("Agrega al menos un ingrediente.");
  }

  const seen = new Set<string>();
  for (const line of input.lines) {
    if (line.quantity <= 0) {
      throw new Error("La cantidad de cada línea debe ser mayor a cero.");
    }
    if (line.estimatedUnitCost <= 0) {
      throw new Error("El costo estimado de cada línea debe ser mayor a cero.");
    }
    if (seen.has(line.ingredientId)) {
      throw new Error("No repitas el mismo ingrediente en dos líneas.");
    }
    seen.add(line.ingredientId);
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");

  const order = await prisma.purchaseOrder.create({
    data: {
      branchId: DEFAULT_BRANCH_ID,
      supplierId: input.supplierId,
      employeeId: input.employeeId,
      status: "CREADA",
      items: {
        create: input.lines.map((line) => ({
          ingredientId: line.ingredientId,
          orderedQuantity: line.quantity,
          unit: line.unit,
          estimatedUnitCost: line.estimatedUnitCost,
        })),
      },
    },
  });

  revalidatePath("/compras");

  return { id: order.id };
}

export type ReceivePurchaseOrderLineInput = {
  purchaseOrderItemId: string;
  receivedQuantity: number;
  actualUnitCost: number;
  expirationDate?: string; // ISO date, opcional
};

export type ReceivePurchaseOrderInput = {
  employeeId: string;
  purchaseOrderId: string;
  lines: ReceivePurchaseOrderLineInput[];
};

// Recepción de una sola vez, no incremental — PROVEIDA_PARCIALMENTE es
// terminal (ver comentario en PurchaseOrderStatus del schema). Por cada
// línea con receivedQuantity > 0: crea IngredientBatch, incrementa
// InventoryStock, registra InventoryMovement tipo COMPRA, y si el costo
// real difiere del costo cotizado del proveedor, actualiza
// IngredientSupplier.cost dejando rastro en IngredientCostHistory.
export async function receivePurchaseOrder(input: ReceivePurchaseOrderInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "COMPRA_REGISTRAR");

  const receivedLines = input.lines.filter((line) => line.receivedQuantity > 0);
  if (receivedLines.length === 0) {
    throw new Error("Captura al menos una cantidad recibida.");
  }
  for (const line of receivedLines) {
    if (line.actualUnitCost <= 0) {
      throw new Error("El costo real de cada línea recibida debe ser mayor a cero.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { items: true },
    });
    if (!order) {
      throw new Error("La orden no existe.");
    }
    if (order.status !== "CREADA") {
      throw new Error("Esta orden ya fue recibida o cancelada.");
    }

    const itemsById = new Map(order.items.map((item) => [item.id, item]));

    for (const line of receivedLines) {
      const item = itemsById.get(line.purchaseOrderItemId);
      if (!item) {
        throw new Error("Línea de orden inválida.");
      }

      await tx.inventoryStock.upsert({
        where: {
          ingredientId_stockLocationId: {
            ingredientId: item.ingredientId,
            stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          },
        },
        update: { quantity: { increment: line.receivedQuantity } },
        create: {
          ingredientId: item.ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          quantity: line.receivedQuantity,
        },
      });

      await tx.ingredientBatch.create({
        data: {
          ingredientId: item.ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          quantity: line.receivedQuantity,
          unit: item.unit,
          expirationDate: line.expirationDate ? new Date(line.expirationDate) : null,
          purchaseOrderItemId: item.id,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          type: "COMPRA",
          ingredientId: item.ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          quantity: line.receivedQuantity,
          unit: item.unit,
          branchId: order.branchId,
          employeeId: input.employeeId,
          notes: `Recepción orden ${order.id}`,
        },
      });

      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: {
          receivedQuantity: line.receivedQuantity,
          actualUnitCost: line.actualUnitCost,
        },
      });

      const ingredientSupplier = await tx.ingredientSupplier.findUnique({
        where: {
          ingredientId_supplierId: {
            ingredientId: item.ingredientId,
            supplierId: order.supplierId,
          },
        },
      });

      if (ingredientSupplier && !ingredientSupplier.cost.equals(line.actualUnitCost)) {
        await tx.ingredientCostHistory.create({
          data: {
            ingredientId: item.ingredientId,
            ingredientSupplierId: ingredientSupplier.id,
            previousCost: ingredientSupplier.cost,
            newCost: line.actualUnitCost,
            costUnit: item.unit,
            source: `Recepción orden ${order.id}`,
          },
        });
        await tx.ingredientSupplier.update({
          where: { id: ingredientSupplier.id },
          data: { cost: line.actualUnitCost },
        });
      }
    }

    const receivedByItemId = new Map(receivedLines.map((line) => [line.purchaseOrderItemId, line]));
    const allFullyReceived = order.items.every((item) => {
      const receivedLine = receivedByItemId.get(item.id);
      return Boolean(receivedLine) && receivedLine!.receivedQuantity >= item.orderedQuantity.toNumber();
    });

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: allFullyReceived ? "PROVEIDA" : "PROVEIDA_PARCIALMENTE",
        receivedAt: new Date(),
      },
    });
  });

  revalidatePath("/compras");
  revalidatePath(`/compras/${input.purchaseOrderId}`);
  revalidatePath("/inventario");
}
