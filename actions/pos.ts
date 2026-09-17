"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  PaymentMethod,
  UnitOfMeasure,
  DiscountType,
  ManualDiscountReason,
  SaleOrderType,
  DomicilioOrigen,
  type VariantTemperature,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { getSessionEmployeeId, findEmployeeByPin } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";

export type CreateSaleExtraIngredientInput = {
  ingredientId: string;
  /** En la unidad que el cliente capturó (baseUnit o Ingredient.standardDoseUnit) — ver `unit`. */
  quantity: number;
  unit: UnitOfMeasure;
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
  // Solo aplica cuando orderType = DOMICILIO.
  domicilioOrigen?: DomicilioOrigen;
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
// Resolución de items — decisión de arquitectura ADR-001: el inventario
// NUNCA se descuenta por producto terminado, siempre por ingrediente vía
// la receta activa de cada variante, resuelta recursivamente cuando hay
// ingredientes compuestos (ej. un jarabe casero es a su vez una Recipe
// INGREDIENTE_COMPUESTO).
//
// Extraído de lo que antes era el cuerpo de createSale (rama
// "cambios para la sección productos" / "cuentas abiertas") para
// reusarlo también al abrir una cuenta de Mesa y al agregarle rondas de
// productos — una venta normal, abrir cuenta, y cada ronda de una cuenta
// abierta resuelven items de la misma forma.
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
// manda qué ingrediente/unidad/cantidad, nunca el precio — se calcula
// aquí desde el costo cotizado en Compras (IngredientSupplier.isSelected),
// para que un precio manipulado del lado del cliente nunca llegue a
// cobrarse. La cantidad se convierte a baseUnit vía toBaseUnit() antes de
// costear/descontar — el cliente puede capturarla en una "dosis
// estándar" distinta al baseUnit (ej. "1 pump" de vainilla en vez de
// mililitros, ver Ingredient.standardDoseUnit).
type ResolvedSaleItem = {
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
};

async function resolveSaleItems(
  tx: Prisma.TransactionClient,
  items: CreateSaleItemInput[]
): Promise<{ saleItemsData: ResolvedSaleItem[]; consumption: Map<string, Prisma.Decimal>; subtotal: Prisma.Decimal }> {
  const ingredientInfoCache = new Map<string, { baseUnit: UnitOfMeasure; category: string }>();
  const consumption = new Map<string, Prisma.Decimal>();

  async function getIngredientInfo(ingredientId: string) {
    let info = ingredientInfoCache.get(ingredientId);
    if (!info) {
      const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
      info = { baseUnit: ingredient.baseUnit, category: ingredient.category };
      ingredientInfoCache.set(ingredientId, info);
    }
    return info;
  }

  async function toBaseUnit(ingredientId: string, quantity: Prisma.Decimal, unit: UnitOfMeasure) {
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
    consumption.set(ingredientId, (consumption.get(ingredientId) ?? new Prisma.Decimal(0)).add(quantity));
  }

  async function resolveRecipeConsumption(
    recipeVersionId: string,
    multiplier: Prisma.Decimal,
    excludedCategories: Set<string>,
    depth = 0
  ) {
    if (depth > 10) {
      throw new Error("Profundidad máxima de receta compuesta excedida — posible ciclo entre recetas.");
    }

    const lines = await tx.recipeIngredient.findMany({ where: { recipeVersionId } });

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
        await resolveRecipeConsumption(composedVersion.id, lineQuantity, excludedCategories, depth + 1);
      }
    }
  }

  // Vasos por tamaño (ver ProductVariant.sizeOz, "Módulo Productos") —
  // se cargan una sola vez; se elige el más chico que alcance para cada
  // variante con sizeOz, en vez de que la receta lo liste como
  // ingrediente manual.
  const cupIngredients = await tx.ingredient.findMany({
    where: { cupCapacityOz: { not: null }, isActive: true },
    orderBy: { cupCapacityOz: "asc" },
  });

  let subtotal = new Prisma.Decimal(0);
  const saleItemsData: ResolvedSaleItem[] = [];

  for (const item of items) {
    if (item.quantity <= 0) {
      throw new Error("La cantidad de cada línea debe ser mayor a cero.");
    }

    const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: item.productVariantId } });

    if (variant.sizeOz) {
      const cup = cupIngredients.find((c) => c.cupCapacityOz!.gte(variant.sizeOz!));
      if (!cup) {
        throw new Error(
          `No hay un vaso registrado con capacidad suficiente para ${variant.sizeOz}oz (variante "${variant.name}").`
        );
      }
      addConsumption(cup.id, new Prisma.Decimal(item.quantity));
    }

    const activeRecipe = await tx.recipe.findFirst({
      where: { productVariantId: variant.id, kind: "PRODUCTO_VENDIBLE" },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    const recipeVersion = activeRecipe?.versions[0] ?? null;

    const modifierOptions = item.modifierOptionIds.length
      ? await tx.modifierOption.findMany({ where: { id: { in: item.modifierOptionIds } } })
      : [];

    const modifierTotal = modifierOptions.reduce((sum, opt) => sum.add(opt.priceDelta), new Prisma.Decimal(0));

    // Extras libres: precio SIEMPRE calculado aquí desde el costo
    // cotizado, nunca confiado del cliente. Cantidad convertida a
    // baseUnit antes de costear/descontar (ver nota arriba).
    const resolvedExtras: ResolvedSaleItem["extraIngredients"] = [];
    let extrasTotal = new Prisma.Decimal(0);

    for (const extra of item.extraIngredients ?? []) {
      if (extra.quantity <= 0) {
        throw new Error("La cantidad de un ingrediente extra debe ser mayor a cero.");
      }
      const { baseUnit } = await getIngredientInfo(extra.ingredientId);
      const baseQty = await toBaseUnit(extra.ingredientId, new Prisma.Decimal(extra.quantity), extra.unit);
      const supplierCost = await tx.ingredientSupplier.findFirst({
        where: { ingredientId: extra.ingredientId, isSelected: true },
      });
      const priceDelta = baseQty.mul(supplierCost?.cost ?? new Prisma.Decimal(0));
      extrasTotal = extrasTotal.add(priceDelta);
      resolvedExtras.push({ ingredientId: extra.ingredientId, quantity: baseQty, baseUnit, priceDelta });
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
      modifiers: modifierOptions.map((opt) => ({ modifierOptionId: opt.id, priceDelta: opt.priceDelta })),
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
      await resolveRecipeConsumption(recipeVersion.id, new Prisma.Decimal(item.quantity), substitutionCategories);
    }

    for (const opt of modifierOptions) {
      if (opt.ingredientId && opt.quantityDelta && opt.unit) {
        const baseQty = await toBaseUnit(opt.ingredientId, opt.quantityDelta.mul(item.quantity), opt.unit);
        addConsumption(opt.ingredientId, baseQty);
      }
    }

    // Extras libres también consumen inventario, escalados por la
    // cantidad de la línea — igual que los ModifierOption con ingrediente.
    for (const extra of resolvedExtras) {
      addConsumption(extra.ingredientId, extra.quantity.mul(item.quantity));
    }
  }

  return { saleItemsData, consumption, subtotal };
}

// Crea los SaleItem (+ modificadores + extras libres) de una ronda de
// items ya resueltos — reusado por createSale, openTab, addItemsToTab y
// closeTab (última ronda antes de cobrar).
async function persistSaleItems(tx: Prisma.TransactionClient, saleId: string, saleItemsData: ResolvedSaleItem[]) {
  for (const item of saleItemsData) {
    const createdItem = await tx.saleItem.create({
      data: {
        saleId,
        productVariantId: item.productVariantId,
        recipeVersionId: item.recipeVersionId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        notes: item.notes,
        modifiers: {
          create: item.modifiers.map((m) => ({ modifierOptionId: m.modifierOptionId, priceDelta: m.priceDelta })),
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
}

// Aplica el consumo de inventario acumulado de una ronda — para una
// cuenta abierta, se llama una vez por ronda (la bebida se prepara al
// pedirse, no hasta que se cobra la cuenta completa).
async function applyConsumption(
  tx: Prisma.TransactionClient,
  consumption: Map<string, Prisma.Decimal>,
  context: { branchId: string; employeeId: string; shiftId: string; saleId: string }
) {
  for (const [ingredientId, quantity] of consumption.entries()) {
    const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });

    await tx.inventoryStock.upsert({
      where: { ingredientId_stockLocationId: { ingredientId, stockLocationId: DEFAULT_STOCK_LOCATION_ID } },
      update: { quantity: { decrement: quantity } },
      create: { ingredientId, stockLocationId: DEFAULT_STOCK_LOCATION_ID, quantity: quantity.negated() },
    });

    await tx.inventoryMovement.create({
      data: {
        type: "VENTA",
        ingredientId,
        stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        quantity: quantity.negated(),
        unit: ingredient.baseUnit,
        branchId: context.branchId,
        employeeId: context.employeeId,
        shiftId: context.shiftId,
        notes: `Venta ${context.saleId}`,
      },
    });
  }
}

// Lealtad: +1 sello por venta COMPLETADA con cliente ligado, se reinicia
// a 0 al llegar a 5 (ver comentario en LoyaltyCard del schema). El nivel
// se deriva contando ventas históricas del cliente — el schema no guarda
// un acumulado aparte, y esta cuenta ya incluye la venta recién creada
// por correr dentro de la misma transacción.
async function applyLoyaltyStamp(tx: Prisma.TransactionClient, customerId: string) {
  const card = await tx.loyaltyCard.upsert({
    where: { customerId },
    update: {},
    create: { customerId, stamps: 0 },
  });

  const incrementedStamps = card.stamps + 1;
  const newStamps = incrementedStamps >= 5 ? 0 : incrementedStamps;

  const lifetimeStamps = await tx.sale.count({ where: { customerId, status: "COMPLETADA" } });

  const eligibleTier = await tx.loyaltyTier.findFirst({
    where: { minLifetimeStamps: { lte: lifetimeStamps } },
    orderBy: { minLifetimeStamps: "desc" },
  });

  await tx.loyaltyCard.update({
    where: { customerId },
    data: { stamps: newStamps, tierId: eligibleTier?.id ?? null },
  });
}

function serializeSale(sale: {
  id: string;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  createdAt: Date;
}) {
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

// Todo corre en una sola transacción de Prisma: si falla el descuento de
// inventario, la venta tampoco se registra.
//
// Simplificaciones conocidas de este MVP (ver docs/CONTINUE.md):
//   - No hay impuestos todavía (el descuento sí — ver computeDiscount).
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

    const { saleItemsData, consumption, subtotal } = await resolveSaleItems(tx, input.items);

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

      const code = await tx.discountCode.findUniqueOrThrow({ where: { id: input.discountCodeId } });
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
        domicilioOrigen: input.orderType === "DOMICILIO" ? input.domicilioOrigen ?? null : null,
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

    await persistSaleItems(tx, createdSale.id, saleItemsData);
    await applyConsumption(tx, consumption, {
      branchId: input.branchId,
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      saleId: createdSale.id,
    });

    if (input.customerId) {
      await applyLoyaltyStamp(tx, input.customerId);
    }

    return createdSale;
  });

  revalidatePath("/pos");
  return serializeSale(sale);
}

// -----------------------------------------------------------------------
// Cuentas abiertas (Mesa) — "cambios para la sección de punto de venta":
// una cuenta puede quedar abierta (Sale.status = ABIERTA) para seguir
// agregando rondas de productos y cobrarla después, mientras el cajero
// atiende otras cuentas en paralelo. El inventario se descuenta ronda
// por ronda (la bebida se prepara al pedirse), no hasta que se cobra.
// -----------------------------------------------------------------------

export type OpenTabInput = {
  branchId: string;
  shiftId: string;
  employeeId: string;
  tableNumber: string;
  items: CreateSaleItemInput[];
  customerId?: string;
};

export async function openTab(input: OpenTabInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.items.length === 0) {
    throw new Error("La cuenta no tiene productos.");
  }
  if (!input.tableNumber.trim()) {
    throw new Error("Captura el número de mesa para dejar la cuenta abierta.");
  }

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const sale = await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift || shift.status !== "ABIERTO" || shift.branchId !== input.branchId) {
      throw new Error("No hay un turno abierto válido para esta cuenta.");
    }

    const { saleItemsData, consumption, subtotal } = await resolveSaleItems(tx, input.items);

    const createdSale = await tx.sale.create({
      data: {
        branchId: input.branchId,
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        status: "ABIERTA",
        orderType: "CONSUMO_LOCAL",
        tableNumber: input.tableNumber.trim(),
        customerId: input.customerId || null,
        subtotal,
        discountTotal: 0,
        total: subtotal,
      },
    });

    await persistSaleItems(tx, createdSale.id, saleItemsData);
    await applyConsumption(tx, consumption, {
      branchId: input.branchId,
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      saleId: createdSale.id,
    });

    return createdSale;
  });

  revalidatePath("/pos");
  return serializeSale(sale);
}

async function loadOpenTab(tx: Prisma.TransactionClient, saleId: string, branchId: string, shiftId: string) {
  const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
  if (sale.status !== "ABIERTA") {
    throw new Error("Esta cuenta ya no está abierta.");
  }
  if (sale.branchId !== branchId || sale.shiftId !== shiftId) {
    throw new Error("Esta cuenta no pertenece al turno/sucursal actual.");
  }
  return sale;
}

export type AddItemsToTabInput = {
  saleId: string;
  branchId: string;
  shiftId: string;
  employeeId: string;
  items: CreateSaleItemInput[];
};

export async function addItemsToTab(input: AddItemsToTabInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.items.length === 0) {
    throw new Error("La ronda no tiene productos.");
  }

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const sale = await prisma.$transaction(async (tx) => {
    const existing = await loadOpenTab(tx, input.saleId, input.branchId, input.shiftId);
    const { saleItemsData, consumption, subtotal } = await resolveSaleItems(tx, input.items);

    await persistSaleItems(tx, existing.id, saleItemsData);
    await applyConsumption(tx, consumption, {
      branchId: input.branchId,
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      saleId: existing.id,
    });

    return tx.sale.update({
      where: { id: existing.id },
      data: {
        subtotal: existing.subtotal.add(subtotal),
        total: existing.total.add(subtotal),
      },
    });
  });

  revalidatePath("/pos");
  return serializeSale(sale);
}

export type CloseTabInput = {
  saleId: string;
  branchId: string;
  shiftId: string;
  employeeId: string;
  // Última ronda de productos, si se agrega justo al cobrar.
  items?: CreateSaleItemInput[];
  payments: { method: PaymentMethod; amount: number; note?: string }[];
  customerId?: string;
  discountCodeId?: string;
  manualDiscount?: ManualDiscountInput;
};

export async function closeTab(input: CloseTabInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const sale = await prisma.$transaction(async (tx) => {
    let existing = await loadOpenTab(tx, input.saleId, input.branchId, input.shiftId);

    if (input.items && input.items.length > 0) {
      const { saleItemsData, consumption, subtotal: roundSubtotal } = await resolveSaleItems(tx, input.items);
      await persistSaleItems(tx, existing.id, saleItemsData);
      await applyConsumption(tx, consumption, {
        branchId: input.branchId,
        employeeId: input.employeeId,
        shiftId: input.shiftId,
        saleId: existing.id,
      });
      existing = await tx.sale.update({
        where: { id: existing.id },
        data: { subtotal: existing.subtotal.add(roundSubtotal), total: existing.total.add(roundSubtotal) },
      });
    }

    // El subtotal acumulado de toda la cuenta (todas las rondas) es la
    // base del descuento — una cuenta abierta no carga descuento hasta
    // que se cierra.
    const subtotal = existing.subtotal;

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
      const code = await tx.discountCode.findUniqueOrThrow({ where: { id: input.discountCodeId } });
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
      throw new Error("El descuento no puede ser mayor al subtotal de la cuenta.");
    }

    const total = subtotal.sub(discountTotal);

    const paymentsTotal = input.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentsTotal - total.toNumber()) > 0.01) {
      throw new Error("El total pagado no coincide con el total de la cuenta.");
    }

    const customerId = input.customerId || existing.customerId || null;

    const closedSale = await tx.sale.update({
      where: { id: existing.id },
      data: {
        status: "COMPLETADA",
        discountTotal,
        total,
        customerId,
        discountCodeId: input.discountCodeId || null,
        ...(manualDiscountData ? { manualDiscount: { create: manualDiscountData } } : {}),
        payments: {
          create: input.payments.map((p) => ({ method: p.method, amount: p.amount, note: p.note?.trim() || null })),
        },
      },
    });

    if (customerId) {
      await applyLoyaltyStamp(tx, customerId);
    }

    return closedSale;
  });

  revalidatePath("/pos");
  return serializeSale(sale);
}

export type OpenTabSummary = {
  id: string;
  tableNumber: string | null;
  total: number;
  itemCount: number;
  createdAt: string;
};

export async function listOpenTabs(branchId: string): Promise<OpenTabSummary[]> {
  const employeeId = await getSessionEmployeeId();
  if (!employeeId) {
    throw new Error("Necesitas iniciar sesión para ver las cuentas abiertas.");
  }

  const sales = await prisma.sale.findMany({
    where: { branchId, status: "ABIERTA" },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { items: true } } },
  });

  return sales.map((sale) => ({
    id: sale.id,
    tableNumber: sale.tableNumber,
    total: sale.total.toNumber(),
    itemCount: sale._count.items,
    createdAt: sale.createdAt.toISOString(),
  }));
}

export type OpenTabItem = {
  id: string;
  productVariantName: string;
  temperature: VariantTemperature | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifierNames: string[];
  notes: string | null;
};

export type OpenTabDetail = {
  id: string;
  tableNumber: string | null;
  total: number;
  items: OpenTabItem[];
};

// Resumen de lo ya registrado en una cuenta abierta — al retomarla, el
// cajero lo revisa (y puede corregirlo, ver removeTabItem/
// updateTabItemQuantity abajo) antes de cobrar, para rectificar con el
// cliente que todo esté bien.
export async function getTabDetail(saleId: string): Promise<OpenTabDetail> {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      items: {
        include: {
          productVariant: { include: { product: true } },
          modifiers: { include: { modifierOption: true } },
        },
      },
    },
  });

  return {
    id: sale.id,
    tableNumber: sale.tableNumber,
    total: sale.total.toNumber(),
    items: sale.items.map((item) => ({
      id: item.id,
      productVariantName: item.productVariant?.name ?? "(producto eliminado)",
      temperature: item.productVariant?.temperature ?? null,
      productName: item.productVariant?.product.name ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      lineTotal: item.lineTotal.toNumber(),
      modifierNames: item.modifiers.map((m) => m.modifierOption.name),
      notes: item.notes,
    })),
  };
}

// Ingredientes/modificadores/extras ya guardados de un SaleItem, en el
// shape que resolveSaleItems espera — para poder recalcular su consumo
// de inventario a una cantidad dada (la que tenía, o una nueva).
type ReconstructedTabItem = {
  productVariantId: string;
  modifierOptionIds: string[];
  extraIngredients: { ingredientId: string; quantity: number; unit: UnitOfMeasure }[];
};

async function reconstructTabItem(
  tx: Prisma.TransactionClient,
  item: { id: string; productVariantId: string | null; modifiers: { modifierOptionId: string }[] }
): Promise<ReconstructedTabItem | null> {
  if (!item.productVariantId) return null;
  const adjustments = await tx.saleItemIngredientAdjustment.findMany({ where: { saleItemId: item.id } });
  return {
    productVariantId: item.productVariantId,
    modifierOptionIds: item.modifiers.map((m) => m.modifierOptionId),
    extraIngredients: adjustments.map((a) => ({
      ingredientId: a.ingredientId,
      quantity: a.quantity.toNumber(),
      unit: a.unit,
    })),
  };
}

// Consumo de inventario que un item ya guardado causaría a una cantidad
// dada — reusa resolveSaleItems tal cual con un solo item sintético.
// Simplificación aceptada: usa la receta ACTIVA actual del producto, no
// la versión exacta (`SaleItem.recipeVersionId`) que se usó al
// agregarlo — si nadie edita esa receta entre que se agrega el item y
// se corrige (lo normal dentro de una misma cuenta abierta), da el
// mismo resultado.
async function computeTabItemConsumption(
  tx: Prisma.TransactionClient,
  reconstructed: ReconstructedTabItem,
  quantity: number
): Promise<Map<string, Prisma.Decimal>> {
  const { consumption } = await resolveSaleItems(tx, [{ ...reconstructed, quantity }]);
  return consumption;
}

// Aplica un delta de consumo (positivo = consumir más del inventario,
// negativo = regresar/restockear) — mismo criterio de signo que
// applyConsumption (quantity positiva ahí siempre resta del stock), solo
// que aquí el valor puede ser negativo para las correcciones de cuentas
// abiertas (quitar/ajustar cantidad de un producto ya registrado).
async function applyConsumptionDelta(
  tx: Prisma.TransactionClient,
  delta: Map<string, Prisma.Decimal>,
  context: { branchId: string; employeeId: string; shiftId: string; saleId: string }
) {
  for (const [ingredientId, quantity] of delta.entries()) {
    if (quantity.isZero()) continue;
    await tx.inventoryStock.update({
      where: { ingredientId_stockLocationId: { ingredientId, stockLocationId: DEFAULT_STOCK_LOCATION_ID } },
      data: { quantity: { decrement: quantity } },
    });
    const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    await tx.inventoryMovement.create({
      data: {
        type: "VENTA",
        ingredientId,
        stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        quantity: quantity.negated(),
        unit: ingredient.baseUnit,
        branchId: context.branchId,
        employeeId: context.employeeId,
        shiftId: context.shiftId,
        notes: `Corrección cuenta ${context.saleId}`,
      },
    });
  }
}

function subtractConsumption(
  a: Map<string, Prisma.Decimal>,
  b: Map<string, Prisma.Decimal>
): Map<string, Prisma.Decimal> {
  const delta = new Map<string, Prisma.Decimal>();
  for (const ingredientId of new Set([...a.keys(), ...b.keys()])) {
    const d = (a.get(ingredientId) ?? new Prisma.Decimal(0)).sub(b.get(ingredientId) ?? new Prisma.Decimal(0));
    if (!d.isZero()) delta.set(ingredientId, d);
  }
  return delta;
}

async function deleteSaleItemChildren(tx: Prisma.TransactionClient, saleItemId: string) {
  await tx.saleItemModifier.deleteMany({ where: { saleItemId } });
  await tx.saleItemIngredientAdjustment.deleteMany({ where: { saleItemId } });
}

export type RemoveTabItemInput = {
  saleItemId: string;
  branchId: string;
  shiftId: string;
  employeeId: string;
};

// Quitar un producto ya registrado de una cuenta abierta (antes de
// cobrar) — restaura el inventario que ya se había descontado. Solo
// mientras la cuenta sigue ABIERTA; una venta ya cobrada no se corrige
// aquí (existe VENTA_CANCELAR para eso).
export async function removeTabItem(input: RemoveTabItemInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const sale = await prisma.$transaction(async (tx) => {
    const item = await tx.saleItem.findUniqueOrThrow({
      where: { id: input.saleItemId },
      include: { sale: true, modifiers: true },
    });
    if (item.sale.status !== "ABIERTA") {
      throw new Error("Esta cuenta ya no está abierta.");
    }
    if (item.sale.branchId !== input.branchId || item.sale.shiftId !== input.shiftId) {
      throw new Error("Esta cuenta no pertenece al turno/sucursal actual.");
    }

    const reconstructed = await reconstructTabItem(tx, item);
    if (reconstructed) {
      const consumption = await computeTabItemConsumption(tx, reconstructed, item.quantity);
      // Restockear todo lo que este item había consumido — delta negativo.
      const reversal = new Map([...consumption].map(([id, qty]) => [id, qty.negated()] as const));
      await applyConsumptionDelta(tx, reversal, {
        branchId: input.branchId,
        employeeId: input.employeeId,
        shiftId: input.shiftId,
        saleId: item.saleId,
      });
    }
    await deleteSaleItemChildren(tx, item.id);
    await tx.saleItem.delete({ where: { id: item.id } });

    return tx.sale.update({
      where: { id: item.saleId },
      data: { subtotal: { decrement: item.lineTotal }, total: { decrement: item.lineTotal } },
    });
  });

  revalidatePath("/pos");
  return serializeSale(sale);
}

export type UpdateTabItemQuantityInput = {
  saleItemId: string;
  branchId: string;
  shiftId: string;
  employeeId: string;
  quantity: number;
};

// Ajustar la cantidad de un producto ya registrado en una cuenta
// abierta — actualiza el SaleItem existente en su lugar (misma fila,
// mismo id) en vez de quitarlo y crear uno nuevo, para que no cambie de
// posición en la lista que el cajero está revisando con el cliente
// (bug real encontrado en verificación: reordenaba la lista de forma
// confusa). Solo se ajusta el inventario por la diferencia exacta entre
// la cantidad vieja y la nueva.
export async function updateTabItemQuantity(input: UpdateTabItemQuantityInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  if (input.quantity <= 0) {
    throw new Error("La cantidad debe ser mayor a cero — para quitar el producto, usa \"Quitar\".");
  }

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const sale = await prisma.$transaction(async (tx) => {
    const item = await tx.saleItem.findUniqueOrThrow({
      where: { id: input.saleItemId },
      include: { sale: true, modifiers: true },
    });
    if (item.sale.status !== "ABIERTA") {
      throw new Error("Esta cuenta ya no está abierta.");
    }
    if (item.sale.branchId !== input.branchId || item.sale.shiftId !== input.shiftId) {
      throw new Error("Esta cuenta no pertenece al turno/sucursal actual.");
    }
    const reconstructed = await reconstructTabItem(tx, item);
    if (!reconstructed) {
      throw new Error("Este producto ya no existe, no se puede ajustar — quítalo.");
    }

    const oldConsumption = await computeTabItemConsumption(tx, reconstructed, item.quantity);
    const newConsumption = await computeTabItemConsumption(tx, reconstructed, input.quantity);
    const delta = subtractConsumption(newConsumption, oldConsumption);
    await applyConsumptionDelta(tx, delta, {
      branchId: input.branchId,
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      saleId: item.saleId,
    });

    const newLineTotal = item.unitPrice.mul(input.quantity);
    const lineTotalDelta = newLineTotal.sub(item.lineTotal);

    await tx.saleItem.update({
      where: { id: item.id },
      data: { quantity: input.quantity, lineTotal: newLineTotal },
    });

    return tx.sale.update({
      where: { id: item.saleId },
      data: { subtotal: { increment: lineTotalDelta }, total: { increment: lineTotalDelta } },
    });
  });

  revalidatePath("/pos");
  return serializeSale(sale);
}
