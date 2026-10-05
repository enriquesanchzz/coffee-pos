"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import type { UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission, requireAdminRole } from "@/lib/permissions";

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

export const createSupplier = safeAction(async function createSupplier(input: CreateSupplierInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

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
});

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

export const updateSupplier = safeAction(async function updateSupplier(input: UpdateSupplierInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

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
});

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
export const upsertIngredientSupplier = safeAction(async function upsertIngredientSupplier(input: UpsertIngredientSupplierInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.cost <= 0) {
    throw new Error("El costo debe ser mayor a cero.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

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
});

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

export const createPurchaseOrder = safeAction(async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
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
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

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
});

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

// Recepción reabrible: una orden PROVEIDA_PARCIALMENTE se puede volver a
// recibir (una o más veces) hasta completarse o cancelarse explícitamente
// (`cancelPurchaseOrder`) — ya no es terminal (decisión confirmada con el
// usuario, ver docs/CONTINUE.md "Cambios de Administración — Frente 4").
// `PurchaseOrderItem.receivedQuantity` es ahora un acumulado entre pasadas,
// no "lo recibido en esta pasada" — cada pasada solo puede recibir hasta
// lo que falte (orderedQuantity - receivedQuantity ya acumulado). Por cada
// línea con receivedQuantity > 0 en esta pasada: crea IngredientBatch,
// incrementa InventoryStock, registra InventoryMovement tipo COMPRA (todo
// esto SÍ es por-pasada, no acumulado — cada pasada mueve solo lo que
// llegó en ella), y si el costo real difiere del costo cotizado del
// proveedor, actualiza IngredientSupplier.cost dejando rastro en
// IngredientCostHistory.
export const receivePurchaseOrder = safeAction(async function receivePurchaseOrder(input: ReceivePurchaseOrderInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "COMPRA_REGISTRAR");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

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
      include: { items: { include: { ingredient: true } } },
    });
    if (!order) {
      throw new Error("La orden no existe.");
    }
    if (order.status !== "CREADA" && order.status !== "PROVEIDA_PARCIALMENTE") {
      throw new Error("Esta orden ya fue recibida por completo o fue cancelada.");
    }

    const itemsById = new Map(order.items.map((item) => [item.id, item]));

    for (const line of receivedLines) {
      const item = itemsById.get(line.purchaseOrderItemId);
      if (!item) {
        throw new Error("Línea de orden inválida.");
      }

      const alreadyReceived = item.receivedQuantity?.toNumber() ?? 0;
      const pending = item.orderedQuantity.toNumber() - alreadyReceived;
      if (line.receivedQuantity > pending) {
        throw new Error(`${item.ingredient.name}: no puedes recibir más de lo pendiente (quedan ${pending}).`);
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
          receivedQuantity: alreadyReceived + line.receivedQuantity,
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

    // Recalcular contra el estado acumulado real (no solo lo tocado en esta
    // pasada) — un ítem ya completado en una pasada anterior debe seguir
    // contando como completo aunque esta pasada no lo haya tocado.
    const receivedThisPassByItemId = new Map(receivedLines.map((line) => [line.purchaseOrderItemId, line]));
    const allFullyReceived = order.items.every((item) => {
      const receivedThisPass = receivedThisPassByItemId.get(item.id)?.receivedQuantity ?? 0;
      const totalReceived = (item.receivedQuantity?.toNumber() ?? 0) + receivedThisPass;
      return totalReceived >= item.orderedQuantity.toNumber();
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
});

export type UpdatePurchaseOrderInput = {
  employeeId: string;
  purchaseOrderId: string;
  supplierId: string;
  lines: CreatePurchaseOrderLineInput[];
};

// Solo antes de cualquier recepción (status CREADA) — una vez recibida (ni
// que sea parcial) las líneas ya tienen inventario/costos aplicados y
// borrarlas/recrearlas perdería ese rastro. Editar después de recibir no
// está contemplado; para corregir algo ya recibido, la vía es una nueva
// orden.
export const updatePurchaseOrder = safeAction(async function updatePurchaseOrder(input: UpdatePurchaseOrderInput) {
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
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
    if (!order) {
      throw new Error("La orden no existe.");
    }
    if (order.status !== "CREADA") {
      throw new Error("Esta orden ya no se puede editar (ya tiene una recepción o está cancelada).");
    }

    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: order.id } });
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        supplierId: input.supplierId,
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
  });

  revalidatePath("/compras");
  revalidatePath(`/compras/${input.purchaseOrderId}`);
});

export type CancelPurchaseOrderInput = {
  employeeId: string;
  purchaseOrderId: string;
};

// Solo antes de cualquier recepción (status CREADA) — cancelar algo ya
// recibido (ni que sea parcial) dejaría el inventario ya aplicado
// inconsistente con el estado de la orden.
export const cancelPurchaseOrder = safeAction(async function cancelPurchaseOrder(input: CancelPurchaseOrderInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "ORDEN_COMPRA_CREAR");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: input.purchaseOrderId } });
  if (order.status !== "CREADA") {
    throw new Error("Solo se puede cancelar una orden que todavía no ha sido recibida.");
  }

  await prisma.purchaseOrder.update({
    where: { id: input.purchaseOrderId },
    data: { status: "CANCELADA" },
  });

  revalidatePath("/compras");
  revalidatePath(`/compras/${input.purchaseOrderId}`);
});
