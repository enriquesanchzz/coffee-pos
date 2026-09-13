"use server";

import { revalidatePath } from "next/cache";
import { Prisma, PaymentMethod, UnitOfMeasure, DiscountType, ManualDiscountReason, SaleOrderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { getSessionEmployeeId, findEmployeeByPin } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

export type CreateSaleExtraIngredientInput = {
  ingredientId: string;
  /** Siempre en el baseUnit del ingrediente — mismo criterio que el resto de la app. */
  quantity: number;
};

export type CreateSaleItemInput = {
  productVariantId: string;
  quantity: number;
  modifierOptionIds: string[];
  extraIngredients?: CreateSaleExtraIngredientInput[];
  notes?: string;
};

export type ManualDiscountInput = {
  type: DiscountType;
  value: number;
  reason: ManualDiscountReason;
  authorizingPin: string;
};

export type CreateSaleInput = {
  branchId: string;
  shiftId: string;
  employeeId: string;
  items: CreateSaleItemInput[];
  payments: { method: PaymentMethod; amount: number; note?: string }[];
  orderType: SaleOrderType;
  // Solo aplica cuando orderType = CONSUMO_LOCAL ("Mesa").
  tableNumber?: string;
  customerId?: string;
  discountCodeId?: string;
  manualDiscount?: ManualDiscountInput;
};

// PORCENTAJE -> % del subtotal; MONTO_FIJO -> monto directo; PRECIO_FINAL
// -> el total resultante ES `value` (el descuento es la diferencia).
function computeDiscount(
  type: DiscountType,
  value: Prisma.Decimal,
  subtotal: Prisma.Decimal
): Prisma.Decimal {
  switch (type) {
    case "PORCENTAJE":
      return subtotal.mul(value).div(100);
    case "MONTO_FIJO":
      return value;
    case "PRECIO_FINAL":
      return subtotal.sub(value);
  }
}

// -----------------------------------------------------------------------
// Venta — decisión de arquitectura ADR-001: el inventario NUNCA se descuenta
// por producto terminado, siempre por ingrediente vía la receta activa de
// cada variante, resuelta recursivamente cuando hay ingredientes compuestos
// (ej. un jarabe casero es a su vez una Recipe INGREDIENTE_COMPUESTO).
//
// Todo corre en una sola transacción de Prisma: si falla el descuento de
// inventario, la venta tampoco se registra.
//
// Sustitución real: cuando un ModifierOption con isSubstitution=true está
// seleccionado, se omite del consumo cualquier línea de receta cuyo
// ingrediente comparte `category` con el ingrediente del sustituto (ej.
// "Leche de avena" reemplaza cualquier línea de categoría LECHE). Es una
// heurística por categoría, no un vínculo explícito línea-por-línea — el
// schema no lo modela así — pero es correcta mientras cada receta tenga a
// lo más una línea por categoría sustituible (el caso real de hoy).
//
// Extras libres (SaleItemIngredientAdjustment, AGREGAR_EXTRA): el cliente
// manda qué ingrediente y cuánto, nunca el precio — se calcula aquí desde
// el costo cotizado en Compras (IngredientSupplier.isSelected), para que
// un precio manipulado del lado del cliente nunca llegue a cobrarse.
//
// Simplificaciones conocidas de este MVP (ver docs/CONTINUE.md):
//   - No hay impuestos todavía (el descuento sí — ver computeDiscount).
// -----------------------------------------------------------------------
export async function createSale(input: CreateSaleInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.items.length === 0) {
    throw new Error("La venta no tiene productos.");
  }

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const sale = await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift || shift.status !== "ABIERTO" || shift.branchId !== input.branchId) {
      throw new Error("No hay un turno abierto válido para esta venta.");
    }

    const ingredientInfoCache = new Map<string, { baseUnit: UnitOfMeasure; category: string }>();
    const consumption = new Map<string, Prisma.Decimal>();

    async function getIngredientInfo(ingredientId: string) {
      let info = ingredientInfoCache.get(ingredientId);
      if (!info) {
        const ingredient = await tx.ingredient.findUniqueOrThrow({
          where: { id: ingredientId },
        });
        info = { baseUnit: ingredient.baseUnit, category: ingredient.category };
        ingredientInfoCache.set(ingredientId, info);
      }
      return info;
    }

    async function toBaseUnit(
      ingredientId: string,
      quantity: Prisma.Decimal,
      unit: UnitOfMeasure
    ) {
      const { baseUnit } = await getIngredientInfo(ingredientId);
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
      excludedCategories: Set<string>,
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
          const { category } = await getIngredientInfo(line.ingredientId);
          if (excludedCategories.has(category)) continue; // sustituido, no se descuenta el ingrediente base
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
          await resolveRecipeConsumption(composedVersion.id, lineQuantity, excludedCategories, depth + 1);
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
      notes: string | null;
      modifiers: { modifierOptionId: string; priceDelta: Prisma.Decimal }[];
      extraIngredients: {
        ingredientId: string;
        quantity: Prisma.Decimal;
        baseUnit: UnitOfMeasure;
        priceDelta: Prisma.Decimal;
      }[];
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

      // Extras libres: precio SIEMPRE calculado aquí desde el costo
      // cotizado, nunca confiado del cliente.
      const resolvedExtras: {
        ingredientId: string;
        quantity: Prisma.Decimal;
        baseUnit: UnitOfMeasure;
        priceDelta: Prisma.Decimal;
      }[] = [];
      let extrasTotal = new Prisma.Decimal(0);

      for (const extra of item.extraIngredients ?? []) {
        if (extra.quantity <= 0) {
          throw new Error("La cantidad de un ingrediente extra debe ser mayor a cero.");
        }
        const { baseUnit } = await getIngredientInfo(extra.ingredientId);
        const supplierCost = await tx.ingredientSupplier.findFirst({
          where: { ingredientId: extra.ingredientId, isSelected: true },
        });
        const quantity = new Prisma.Decimal(extra.quantity);
        const priceDelta = quantity.mul(supplierCost?.cost ?? new Prisma.Decimal(0));
        extrasTotal = extrasTotal.add(priceDelta);
        resolvedExtras.push({ ingredientId: extra.ingredientId, quantity, baseUnit, priceDelta });
      }

      const unitPrice = variant.price.add(modifierTotal).add(extrasTotal);
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);

      saleItemsData.push({
        productVariantId: variant.id,
        recipeVersionId: recipeVersion?.id ?? null,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        notes: item.notes?.trim() || null,
        modifiers: modifierOptions.map((opt) => ({
          modifierOptionId: opt.id,
          priceDelta: opt.priceDelta,
        })),
        extraIngredients: resolvedExtras,
      });

      const substitutionCategories = new Set<string>();
      for (const opt of modifierOptions) {
        if (opt.isSubstitution && opt.ingredientId) {
          const { category } = await getIngredientInfo(opt.ingredientId);
          substitutionCategories.add(category);
        }
      }

      if (recipeVersion) {
        await resolveRecipeConsumption(
          recipeVersion.id,
          new Prisma.Decimal(item.quantity),
          substitutionCategories
        );
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

      // Extras libres también consumen inventario, escalados por la
      // cantidad de la línea — igual que los ModifierOption con ingrediente.
      for (const extra of resolvedExtras) {
        addConsumption(extra.ingredientId, extra.quantity.mul(item.quantity));
      }
    }

    // Descuento: código o manual, nunca ambos a la vez.
    if (input.discountCodeId && input.manualDiscount) {
      throw new Error("Solo se puede aplicar un tipo de descuento por venta.");
    }

    let discountTotal = new Prisma.Decimal(0);
    let manualDiscountData: {
      type: DiscountType;
      value: Prisma.Decimal;
      reason: ManualDiscountReason;
      authorizedById: string;
    } | null = null;

    if (input.discountCodeId) {
      await requirePermission(input.employeeId, input.branchId, "DESCUENTO_APLICAR_CODIGO");

      const code = await tx.discountCode.findUniqueOrThrow({
        where: { id: input.discountCodeId },
      });
      if (!code.isActive || (code.expiresAt && code.expiresAt < new Date())) {
        throw new Error("Este código de descuento ya no es válido.");
      }
      discountTotal = computeDiscount(code.type, code.value, subtotal);
    }

    if (input.manualDiscount) {
      const authorizer = await findEmployeeByPin(input.manualDiscount.authorizingPin);
      if (!authorizer) {
        throw new Error("PIN de autorización incorrecto.");
      }
      await requirePermission(authorizer.id, input.branchId, "DESCUENTO_MANUAL");

      const value = new Prisma.Decimal(input.manualDiscount.value);
      discountTotal = computeDiscount(input.manualDiscount.type, value, subtotal);
      manualDiscountData = {
        type: input.manualDiscount.type,
        value,
        reason: input.manualDiscount.reason,
        authorizedById: authorizer.id,
      };
    }

    if (discountTotal.lessThan(0) || discountTotal.greaterThan(subtotal)) {
      throw new Error("El descuento no puede ser mayor al subtotal de la venta.");
    }

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
        orderType: input.orderType,
        tableNumber: input.orderType === "CONSUMO_LOCAL" ? input.tableNumber?.trim() || null : null,
        customerId: input.customerId || null,
        discountCodeId: input.discountCodeId || null,
        subtotal,
        discountTotal,
        total,
        ...(manualDiscountData ? { manualDiscount: { create: manualDiscountData } } : {}),
        payments: {
          create: input.payments.map((p) => ({ method: p.method, amount: p.amount, note: p.note?.trim() || null })),
        },
      },
    });

    // Se crean uno por uno (en vez de un solo Sale.create anidado) para
    // tener el id real de cada SaleItem y poder ligarle sus
    // SaleItemIngredientAdjustment (extras libres) correctamente.
    for (const item of saleItemsData) {
      const createdItem = await tx.saleItem.create({
        data: {
          saleId: createdSale.id,
          productVariantId: item.productVariantId,
          recipeVersionId: item.recipeVersionId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          notes: item.notes,
          modifiers: {
            create: item.modifiers.map((m) => ({
              modifierOptionId: m.modifierOptionId,
              priceDelta: m.priceDelta,
            })),
          },
        },
      });

      if (item.extraIngredients.length > 0) {
        await tx.saleItemIngredientAdjustment.createMany({
          data: item.extraIngredients.map((extra) => ({
            saleItemId: createdItem.id,
            ingredientId: extra.ingredientId,
            type: "AGREGAR_EXTRA",
            quantity: extra.quantity,
            unit: extra.baseUnit,
            priceDelta: extra.priceDelta,
          })),
        });
      }
    }

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

    // Lealtad: +1 sello por venta completada con cliente ligado, se
    // reinicia a 0 al llegar a 5 (ver comentario en LoyaltyCard del
    // schema). El nivel se deriva contando ventas históricas del cliente —
    // el schema no guarda un acumulado aparte, y esta cuenta ya incluye la
    // venta recién creada por correr dentro de la misma transacción.
    if (input.customerId) {
      const card = await tx.loyaltyCard.upsert({
        where: { customerId: input.customerId },
        update: {},
        create: { customerId: input.customerId, stamps: 0 },
      });

      const incrementedStamps = card.stamps + 1;
      const newStamps = incrementedStamps >= 5 ? 0 : incrementedStamps;

      const lifetimeStamps = await tx.sale.count({
        where: { customerId: input.customerId, status: "COMPLETADA" },
      });

      const eligibleTier = await tx.loyaltyTier.findFirst({
        where: { minLifetimeStamps: { lte: lifetimeStamps } },
        orderBy: { minLifetimeStamps: "desc" },
      });

      await tx.loyaltyCard.update({
        where: { customerId: input.customerId },
        data: { stamps: newStamps, tierId: eligibleTier?.id ?? null },
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
