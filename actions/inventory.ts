"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { Prisma, type UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission, requireAdminRole } from "@/lib/permissions";

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
export const adjustInventoryStock = safeAction(async function adjustInventoryStock(input: AdjustInventoryStockInput) {
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
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

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
});

export type UpdateIngredientInput = {
  employeeId: string;
  ingredientId: string;
  name: string;
  categoryId: string;
  baseUnit: UnitOfMeasure;
  purchaseUnit: UnitOfMeasure;
  tracksExpiration: boolean;
  // Precio al cliente como extra libre; vacío/undefined = costo ÷ % de
  // food cost objetivo (ver extraPriceDelta en actions/pos.ts).
  extraUnitPrice?: number | null;
};

function validExtraPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  if (value < 0) {
    throw new Error("El precio como extra no puede ser negativo.");
  }
  return value;
}

export const updateIngredient = safeAction(async function updateIngredient(input: UpdateIngredientInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del insumo es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_CREAR_ITEM");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  await prisma.ingredient.update({
    where: { id: input.ingredientId },
    data: {
      name,
      categoryId: input.categoryId,
      baseUnit: input.baseUnit,
      purchaseUnit: input.purchaseUnit,
      tracksExpiration: input.tracksExpiration,
      ...(input.extraUnitPrice !== undefined
        ? { extraUnitPrice: validExtraPrice(input.extraUnitPrice) }
        : {}),
    },
  });

  revalidatePath("/inventario");
  revalidatePath("/productos");
});

export type DeleteIngredientInput = {
  employeeId: string;
  ingredientId: string;
};

// Sin borrado suave — el insumo se borra de verdad si no hay nada que
// pueda quedar huérfano/corrupto. `recipeItems`/`modifierOptions` son las
// dos únicas relaciones con FK opcional hacia Ingredient (una línea de
// receta puede apuntar a un ingrediente compuesto en vez de uno atómico, y
// una ModifierOption "base" no referencia ninguno) — Postgres las dejaría
// en NULL en vez de bloquear el borrado, así que se revisan a mano antes.
// Todo lo demás (compras, movimientos, stock, lotes, conteos,
// transferencias, historial de costo, punto de reorden) tiene FK
// obligatoria — el RESTRICT de Postgres ya lo bloquea, se traduce el error
// a un mensaje legible.
export const deleteIngredient = safeAction(async function deleteIngredient(input: DeleteIngredientInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_CREAR_ITEM");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  const usage = await prisma.ingredient.findUniqueOrThrow({
    where: { id: input.ingredientId },
    select: { _count: { select: { recipeItems: true, modifierOptions: true } } },
  });
  if (usage._count.recipeItems > 0 || usage._count.modifierOptions > 0) {
    throw new Error("Este insumo se usa en una receta o como modificador — no se puede borrar.");
  }

  try {
    await prisma.ingredient.delete({ where: { id: input.ingredientId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new Error(
        "Este insumo tiene compras, movimientos de inventario u otro historial asociado — no se puede borrar."
      );
    }
    throw err;
  }

  revalidatePath("/inventario");
  revalidatePath("/productos");
});

export type CreateIngredientCategoryInput = {
  employeeId: string;
  name: string;
  icon?: string;
};

export const createIngredientCategory = safeAction(async function createIngredientCategory(input: CreateIngredientCategoryInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre de la categoría es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_CREAR_ITEM");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  const category = await prisma.ingredientCategory.create({
    data: { name, icon: input.icon || null },
  });

  revalidatePath("/inventario");

  return { id: category.id, name: category.name, icon: category.icon };
});

export type UpdateIngredientCategoryInput = {
  employeeId: string;
  categoryId: string;
  name: string;
  icon?: string;
};

export const updateIngredientCategory = safeAction(async function updateIngredientCategory(input: UpdateIngredientCategoryInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre de la categoría es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_CREAR_ITEM");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  await prisma.ingredientCategory.update({
    where: { id: input.categoryId },
    data: { name, icon: input.icon || null },
  });

  revalidatePath("/inventario");
});

export type DeleteIngredientCategoryInput = {
  employeeId: string;
  categoryId: string;
};

export const deleteIngredientCategory = safeAction(async function deleteIngredientCategory(input: DeleteIngredientCategoryInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_CREAR_ITEM");
  await requireAdminRole(input.employeeId, DEFAULT_BRANCH_ID);

  const category = await prisma.ingredientCategory.findUniqueOrThrow({
    where: { id: input.categoryId },
    select: { _count: { select: { ingredients: true } } },
  });
  if (category._count.ingredients > 0) {
    throw new Error("Esta categoría todavía tiene insumos — muévelos o bórralos primero.");
  }

  await prisma.ingredientCategory.delete({ where: { id: input.categoryId } });

  revalidatePath("/inventario");
});
