"use server";

import { revalidatePath } from "next/cache";
import { Prisma, PaymentMethod, UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";

export type CreateSaleItemInput = {
  productVariantId: string;
  quantity: number;
  modifierOptionIds: string[];
};

export type CreateSaleInput = {
  branchId: string;
  shiftId: string;
  employeeId: string;
  items: CreateSaleItemInput[];
  payments: { method: PaymentMethod; amount: number }[];
};

// -----------------------------------------------------------------------
// Venta — decisión de arquitectura ADR-001: el inventario NUNCA se descuenta
// por producto terminado, siempre por ingrediente vía la receta activa de
// cada variante, resuelta recursivamente cuando hay ingredientes compuestos
// (ej. un jarabe casero es a su vez una Recipe INGREDIENTE_COMPUESTO).
//
// Todo corre en una sola transacción de Prisma: si falla el descuento de
// inventario, la venta tampoco se registra.
//
// Simplificaciones conocidas de este MVP (ver docs/CONTINUE.md):
//   - No hay impuestos ni descuentos aplicados todavía (total = subtotal).
//   - Los ModifierOption con isSubstitution = true se suman al consumo
//     igual que un extra normal; no se resta el ingrediente base que
//     sustituyen (falta definir con el negocio qué línea de la receita
//     corresponde reducir).
//   - SaleItemIngredientAdjustment (ajustes libres QUITAR/AUMENTAR/
//     AGREGAR_EXTRA fuera de los ModifierOption curados) no está expuesto
//     en la UI todavía, aunque el modelo lo soporta.
//   - El consumo de inventario se agrega por ingrediente para toda la
//     venta y se registra en un solo InventoryMovement por ingrediente
//     (no uno por línea), por eso no se liga a relatedSaleItemId.
// -----------------------------------------------------------------------
export async function createSale(input: CreateSaleInput) {
  if (input.items.length === 0) {
    throw new Error("La venta no tiene productos.");
  }

  const sale = await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift || shift.status !== "ABIERTO" || shift.branchId !== input.branchId) {
      throw new Error("No hay un turno abierto válido para esta venta.");
    }

    const ingredientBaseUnitCache = new Map<string, UnitOfMeasure>();
    const consumption = new Map<string, Prisma.Decimal>();

    async function toBaseUnit(
      ingredientId: string,
      quantity: Prisma.Decimal,
      unit: UnitOfMeasure
    ) {
      let baseUnit = ingredientBaseUnitCache.get(ingredientId);
      if (!baseUnit) {
        const ingredient = await tx.ingredient.findUniqueOrThrow({
          where: { id: ingredientId },
        });
        baseUnit = ingredient.baseUnit;
        ingredientBaseUnitCache.set(ingredientId, baseUnit);
      }
      if (unit === baseUnit) return quantity;

      const conversion = await tx.unitConversion.findUnique({
        where: { fromUnit_toUnit: { fromUnit: unit, toUnit: baseUnit } },
      });
      if (!conversion) {
        throw new Error(
          `Falta registrar la conversión de ${unit} a ${baseUnit} (UnitConversion) para descontar inventario correctamente.`
        );
      }
      return quantity.mul(conversion.factor);
    }

    function addConsumption(ingredientId: string, quantity: Prisma.Decimal) {
      consumption.set(
        ingredientId,
        (consumption.get(ingredientId) ?? new Prisma.Decimal(0)).add(quantity)
      );
    }

    async function resolveRecipeConsumption(
      recipeVersionId: string,
      multiplier: Prisma.Decimal,
      depth = 0
    ) {
      if (depth > 10) {
        throw new Error(
          "Profundidad máxima de receta compuesta excedida — posible ciclo entre recetas."
        );
      }

      const lines = await tx.recipeIngredient.findMany({
        where: { recipeVersionId },
      });

      for (const line of lines) {
        const lineQuantity = line.quantity.mul(multiplier);

        if (line.ingredientId) {
          const baseQty = await toBaseUnit(line.ingredientId, lineQuantity, line.unit);
          addConsumption(line.ingredientId, baseQty);
        } else if (line.composedRecipeId) {
          const composedVersion = await tx.recipeVersion.findFirst({
            where: { recipeId: line.composedRecipeId, isActive: true },
          });
          if (!composedVersion) {
            throw new Error(
              `El ingrediente compuesto (recipeId=${line.composedRecipeId}) no tiene una versión de receta activa.`
            );
          }
          // `lineQuantity` se usa como multiplicador de la receta compuesta,
          // no como una cantidad con conversión de unidad propia — ver nota
          // en el schema (RecipeIngredient) sobre cómo se calcula el costo
          // de ingredientes compuestos de la misma forma.
          await resolveRecipeConsumption(composedVersion.id, lineQuantity, depth + 1);
        }
      }
    }

    let subtotal = new Prisma.Decimal(0);
    const saleItemsData: {
      productVariantId: string;
      recipeVersionId: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      modifiers: { modifierOptionId: string; priceDelta: Prisma.Decimal }[];
    }[] = [];

    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new Error("La cantidad de cada línea debe ser mayor a cero.");
      }

      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: item.productVariantId },
      });

      const activeRecipe = await tx.recipe.findFirst({
        where: { productVariantId: variant.id, kind: "PRODUCTO_VENDIBLE" },
        include: { versions: { where: { isActive: true }, take: 1 } },
      });
      const recipeVersion = activeRecipe?.versions[0] ?? null;

      const modifierOptions = item.modifierOptionIds.length
        ? await tx.modifierOption.findMany({
            where: { id: { in: item.modifierOptionIds } },
          })
        : [];

      const modifierTotal = modifierOptions.reduce(
        (sum, opt) => sum.add(opt.priceDelta),
        new Prisma.Decimal(0)
      );
      const unitPrice = variant.price.add(modifierTotal);
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);

      saleItemsData.push({
        productVariantId: variant.id,
        recipeVersionId: recipeVersion?.id ?? null,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        modifiers: modifierOptions.map((opt) => ({
          modifierOptionId: opt.id,
          priceDelta: opt.priceDelta,
        })),
      });

      if (recipeVersion) {
        await resolveRecipeConsumption(recipeVersion.id, new Prisma.Decimal(item.quantity));
      }

      for (const opt of modifierOptions) {
        if (opt.ingredientId && opt.quantityDelta && opt.unit) {
          const baseQty = await toBaseUnit(
            opt.ingredientId,
            opt.quantityDelta.mul(item.quantity),
            opt.unit
          );
          addConsumption(opt.ingredientId, baseQty);
        }
      }
    }

    // Sin impuestos ni descuentos todavía — ver docs/CONTINUE.md.
    const discountTotal = new Prisma.Decimal(0);
    const total = subtotal.sub(discountTotal);

    const paymentsTotal = input.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentsTotal - total.toNumber()) > 0.01) {
      throw new Error("El total pagado no coincide con el total de la venta.");
    }

    const createdSale = await tx.sale.create({
      data: {
        branchId: input.branchId,
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        subtotal,
        discountTotal,
        total,
        items: {
          create: saleItemsData.map((item) => ({
            productVariantId: item.productVariantId,
            recipeVersionId: item.recipeVersionId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            modifiers: {
              create: item.modifiers.map((m) => ({
                modifierOptionId: m.modifierOptionId,
                priceDelta: m.priceDelta,
              })),
            },
          })),
        },
        payments: {
          create: input.payments.map((p) => ({ method: p.method, amount: p.amount })),
        },
      },
      include: { items: true },
    });

    for (const [ingredientId, quantity] of consumption.entries()) {
      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: ingredientId },
      });

      await tx.inventoryStock.upsert({
        where: {
          ingredientId_stockLocationId: {
            ingredientId,
            stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          },
        },
        update: { quantity: { decrement: quantity } },
        create: {
          ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          quantity: quantity.negated(),
        },
      });

      await tx.inventoryMovement.create({
        data: {
          type: "VENTA",
          ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          quantity: quantity.negated(),
          unit: ingredient.baseUnit,
          branchId: input.branchId,
          employeeId: input.employeeId,
          shiftId: input.shiftId,
          notes: `Venta ${createdSale.id}`,
        },
      });
    }

    return createdSale;
  });

  revalidatePath("/pos");

  // Server Actions solo pueden devolver datos serializables al cliente —
  // los campos Decimal de Prisma no lo son, así que se convierten aquí en
  // vez de reenviar el registro de Prisma tal cual.
  return {
    id: sale.id,
    subtotal: sale.subtotal.toNumber(),
    discountTotal: sale.discountTotal.toNumber(),
    total: sale.total.toNumber(),
    createdAt: sale.createdAt.toISOString(),
  };
}
