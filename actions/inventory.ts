"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

export type AdjustInventoryStockInput = {
  ingredientId: string;
  employeeId: string;
  newQuantity: number;
  reason: string;
};

// Ajuste manual de stock: el usuario captura la cantidad real contada (no un
// delta) y aquí se calcula la diferencia contra InventoryStock — se registra
// como InventoryMovement tipo AJUSTE_MANUAL (quantity = delta, puede ser
// negativo), igual que el resto de movimientos de inventario en el sistema.
export async function adjustInventoryStock(input: AdjustInventoryStockInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.newQuantity < 0) {
    throw new Error("La cantidad no puede ser negativa.");
  }
  if (!input.reason.trim()) {
    throw new Error("Captura el motivo del ajuste.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_AJUSTAR");

  await prisma.$transaction(async (tx) => {
    const ingredient = await tx.ingredient.findUniqueOrThrow({
      where: { id: input.ingredientId },
    });

    const currentStock = await tx.inventoryStock.findUnique({
      where: {
        ingredientId_stockLocationId: {
          ingredientId: input.ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        },
      },
    });

    const currentQuantity = currentStock?.quantity ?? new Prisma.Decimal(0);
    const newQuantity = new Prisma.Decimal(input.newQuantity);
    const delta = newQuantity.sub(currentQuantity);

    if (delta.isZero()) {
      throw new Error("La cantidad capturada es igual a la actual — no hay nada que ajustar.");
    }

    await tx.inventoryStock.upsert({
      where: {
        ingredientId_stockLocationId: {
          ingredientId: input.ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        },
      },
      update: { quantity: newQuantity },
      create: {
        ingredientId: input.ingredientId,
        stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        quantity: newQuantity,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        type: "AJUSTE_MANUAL",
        ingredientId: input.ingredientId,
        stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        quantity: delta,
        unit: ingredient.baseUnit,
        branchId: DEFAULT_BRANCH_ID,
        employeeId: input.employeeId,
        notes: input.reason.trim(),
      },
    });
  });

  revalidatePath("/inventario");
}
