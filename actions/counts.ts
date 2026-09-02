"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { findEmployeeByPin, getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

// No existe un permiso específico de "conteos" en el catálogo — se usa
// INVENTARIO_AJUSTAR, igual que Transferencias (nivel GERENTE en la matriz).

export type CreatePhysicalCountLineInput = {
  ingredientId: string;
  physicalQty: number;
};

export type CreatePhysicalCountInput = {
  employeeId: string;
  lines: CreatePhysicalCountLineInput[];
};

// Una sola sesión de captura — no hay estado ABIERTO resumible en este
// pase (mismo criterio que la recepción de órdenes de compra). theoreticalQty
// se congela del InventoryStock actual en el momento del submit. No toca
// inventario todavía: eso pasa solo si se aprueba (approvePhysicalCount).
export async function createPhysicalCount(input: CreatePhysicalCountInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.lines.length === 0) {
    throw new Error("Captura al menos un ingrediente.");
  }
  for (const line of input.lines) {
    if (line.physicalQty < 0) {
      throw new Error("La cantidad física no puede ser negativa.");
    }
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR");

  const count = await prisma.$transaction(async (tx) => {
    const stocks = await tx.inventoryStock.findMany({
      where: {
        stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        ingredientId: { in: input.lines.map((line) => line.ingredientId) },
      },
    });
    const stockByIngredient = new Map(stocks.map((stock) => [stock.ingredientId, stock.quantity]));

    const ingredients = await tx.ingredient.findMany({
      where: { id: { in: input.lines.map((line) => line.ingredientId) } },
    });
    const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

    return tx.physicalCount.create({
      data: {
        branchId: DEFAULT_BRANCH_ID,
        performedById: input.employeeId,
        status: "PENDIENTE_APROBACION",
        lines: {
          create: input.lines.map((line) => ({
            ingredientId: line.ingredientId,
            theoreticalQty: stockByIngredient.get(line.ingredientId) ?? new Prisma.Decimal(0),
            physicalQty: line.physicalQty,
            unit: ingredientById.get(line.ingredientId)!.baseUnit,
          })),
        },
      },
    });
  });

  revalidatePath("/compras/conteos");

  return { id: count.id };
}

export type ApprovePhysicalCountInput = {
  physicalCountId: string;
  confirmingPin: string;
  decision: "APROBADO" | "RECHAZADO";
};

// Requiere el PIN de un empleado distinto de quien hizo el conteo, con
// permiso para ajustar inventario — mismo patrón que la doble confirmación
// de Caja (verifyConfirmingEmployee en actions/shift.ts). Si se aprueba,
// ajusta InventoryStock al valor físico donde hubo diferencia y registra
// InventoryMovement tipo CONTEO_FISICO_AJUSTE. Si se rechaza, no toca
// inventario — el conteo se descarta.
export async function approvePhysicalCount(input: ApprovePhysicalCountInput) {
  await prisma.$transaction(async (tx) => {
    const count = await tx.physicalCount.findUnique({
      where: { id: input.physicalCountId },
      include: { lines: true },
    });
    if (!count) {
      throw new Error("El conteo no existe.");
    }
    if (count.status !== "PENDIENTE_APROBACION") {
      throw new Error("Este conteo ya fue resuelto.");
    }

    const approver = await findEmployeeByPin(input.confirmingPin);
    if (!approver) {
      throw new Error("PIN de aprobación incorrecto.");
    }
    if (approver.id === count.performedById) {
      throw new Error("La aprobación debe ser de un empleado distinto de quien hizo el conteo.");
    }
    await requirePermission(approver.id, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR");

    if (input.decision === "APROBADO") {
      for (const line of count.lines) {
        const diff = line.physicalQty.sub(line.theoreticalQty);
        if (diff.isZero()) continue;

        await tx.inventoryStock.upsert({
          where: {
            ingredientId_stockLocationId: {
              ingredientId: line.ingredientId,
              stockLocationId: DEFAULT_STOCK_LOCATION_ID,
            },
          },
          update: { quantity: line.physicalQty },
          create: {
            ingredientId: line.ingredientId,
            stockLocationId: DEFAULT_STOCK_LOCATION_ID,
            quantity: line.physicalQty,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            type: "CONTEO_FISICO_AJUSTE",
            ingredientId: line.ingredientId,
            stockLocationId: DEFAULT_STOCK_LOCATION_ID,
            quantity: diff,
            unit: line.unit,
            branchId: DEFAULT_BRANCH_ID,
            employeeId: approver.id,
            notes: `Conteo físico ${count.id}`,
          },
        });
      }
    }

    await tx.physicalCount.update({
      where: { id: count.id },
      data: { status: input.decision, closedAt: new Date(), approvedById: approver.id },
    });
  });

  revalidatePath("/compras/conteos");
  revalidatePath(`/compras/conteos/${input.physicalCountId}`);
  revalidatePath("/inventario");
}
