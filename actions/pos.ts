"use server";

import { safeAction } from "@/lib/safe-action";
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
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { getSessionEmployeeId, findEmployeeByPin, assertSessionEmployee, SessionExpiredError } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { zonedClock } from "@/lib/time";
import { unitLabel } from "@/lib/utils";
import { SHORTAGE_ERROR_PREFIX } from "@/lib/stock";

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
  // Id del intento de cobro (ver Sale.clientRequestId): un reintento con
  // el mismo id regresa la venta ya registrada en vez de duplicarla.
  clientRequestId?: string;
  // El cajero ya vio la advertencia de insumos insuficientes y decidió
  // vender de todos modos (ver findShortages).
  allowShortage?: boolean;
  branchId: string;
  shiftId: string;
  employeeId: string;
  items: CreateSaleItemInput[];
  payments: { method: PaymentMethod; amount: number; note?: string }[];
  // Propina en pesos — se cobra con los pagos pero no cuenta como venta.
  tipAmount?: number;
  orderType: SaleOrderType;
  // Solo aplica cuando orderType = CONSUMO_LOCAL ("Mesa").
  tableNumber?: string;
  // Solo aplica cuando orderType = DOMICILIO.
  domicilioOrigen?: DomicilioOrigen;
  customerId?: string;
  discountCodeId?: string;
  manualDiscount?: ManualDiscountInput;
};

// Propina: valor libre capturado por el cajero (monto ya calculado en el
// cliente a partir de $ o %). Redondeado a centavos y nunca negativo.
function validateTipAmount(tip: number | undefined): Prisma.Decimal {
  if (tip === undefined) return new Prisma.Decimal(0);
  if (!Number.isFinite(tip) || tip < 0) {
    throw new Error("La propina no puede ser negativa.");
  }
  return new Prisma.Decimal(tip).toDecimalPlaces(2);
}

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

// Valida un DiscountCode (existe/activo/no expirado y, si es personal —
// ver DiscountCode.customerId, ej. el cupón de bienvenida de
// actions/customers.ts — que sea del cliente correcto y no se haya
// usado ya) y regresa el monto de descuento. Si es personal, lo marca
// usado dentro de la misma transacción de la venta — si la venta
// termina fallando por otra razón, la transacción entera se revierte
// junto con esta marca. Compartido por createSale y closeTab.
async function validateAndConsumeDiscountCode(
  tx: Prisma.TransactionClient,
  input: { discountCodeId: string; customerId?: string; subtotal: Prisma.Decimal }
): Promise<Prisma.Decimal> {
  const code = await tx.discountCode.findUniqueOrThrow({ where: { id: input.discountCodeId } });
  if (!code.isActive || (code.expiresAt && code.expiresAt < new Date())) {
    throw new Error("Este código de descuento ya no es válido.");
  }
  if (code.customerId) {
    if (code.customerId !== input.customerId) {
      throw new Error("Este cupón es para otro cliente.");
    }
    if (code.usedAt) {
      throw new Error("Este cupón ya se usó.");
    }
    await tx.discountCode.update({ where: { id: code.id }, data: { usedAt: new Date() } });
  }
  return computeDiscount(code.type, code.value, input.subtotal);
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
  // Promociones automáticas (Paquetes/2x1/Día temático) — ver
  // applyPromotions. comboId se persiste en SaleItem.comboId (campo que
  // ya existía en el schema); hasAutomaticPromotion marca que lineTotal
  // ya refleja un ajuste automático, para excluir la línea del subtotal
  // "descontable" por DiscountCode/ManualDiscount (no se apilan).
  comboId: string | null;
  hasAutomaticPromotion: boolean;
};

// -----------------------------------------------------------------------
// Promociones automáticas (Paquetes/2x1/Día temático) — módulo
// Promociones. Sin manejo de zona horaria especial (hora del servidor,
// igual que el resto del sistema). Se evalúa una vez por ronda de
// resolveSaleItems — una cuenta abierta (Mesa) con varias rondas NO
// combina líneas de rondas distintas para armar un paquete (cada ronda
// se resuelve por separado, igual que ya pasa con recetas/consumo).
//
// Orden de precedencia, cada línea recibe como máximo UNA promoción:
// Paquetes primero (consumen líneas limpias enteras — sin modificadores
// ni extras — por mayor descuento primero), luego 2x1, luego Día
// temático sobre lo que quede sin tocar.
function isPromotionActiveNow(
  daysOfWeek: number[],
  startTime: string | null,
  endTime: string | null,
  now: Date
): boolean {
  // Día y hora de la sucursal, no del servidor (ver lib/time.ts).
  const clock = zonedClock(now);
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const minutesNow = clock.hour * 60 + clock.minute;
  const start = startTime ? toMinutes(startTime) : 0;
  const end = endTime ? toMinutes(endTime) : 23 * 60 + 59;

  // Horario que cruza la medianoche (ej. 18:00 → 02:00, QA-007): activo
  // desde `start` hasta el fin del día y de 00:00 a `end`. La parte de
  // madrugada pertenece al día en que empezó la promoción (viernes 18:00 →
  // sábado 02:00 cuenta como "viernes" para daysOfWeek).
  const crossesMidnight = start > end;
  let weekday = clock.weekday;
  if (crossesMidnight) {
    const inLateWindow = minutesNow >= start;
    const inEarlyWindow = minutesNow <= end;
    if (!inLateWindow && !inEarlyWindow) return false;
    if (inEarlyWindow && !inLateWindow) weekday = (weekday + 6) % 7;
  } else if (minutesNow < start || minutesNow > end) {
    return false;
  }

  return daysOfWeek.length === 0 || daysOfWeek.includes(weekday);
}

// Promoción automática aplicada en una ronda — se regresa al POS para que
// el cajero vea por qué cambió el total (antes el subtotal bajaba o subía
// sin ninguna explicación).
export type AppliedPromotion = { name: string; saving: number };

async function applyPromotions(
  tx: Prisma.TransactionClient,
  saleItemsData: ResolvedSaleItem[],
  now: Date
): Promise<{ discountableSubtotal: Prisma.Decimal; applied: AppliedPromotion[] }> {
  const savings = new Map<string, Prisma.Decimal>();
  function recordSaving(name: string, saving: Prisma.Decimal) {
    if (saving.lessThanOrEqualTo(0)) return;
    savings.set(name, (savings.get(name) ?? new Prisma.Decimal(0)).add(saving));
  }

  // Una línea "modificada" no califica (combo/2x1/día temático), pero un
  // grupo de modificadores como "Tipo de leche" con su opción base
  // seleccionada (ej. "Entera", priceDelta=0, sin sustituir ingrediente)
  // no cuenta como modificación real — es solo la receta por default, no
  // algo que el cliente cambió. Sin este matiz, ninguna bebida con leche
  // (Latte, Cortado, etc.) podría calificar nunca, ni siquiera sin pedir
  // ningún cambio — y el pedido original del usuario usa justo "Jueves de
  // Latte al 50%" como ejemplo de Día temático.
  function isEligible(item: ResolvedSaleItem) {
    const hasRealModifier = item.modifiers.some((m) => !m.priceDelta.equals(0));
    return !hasRealModifier && item.extraIngredients.length === 0 && !item.hasAutomaticPromotion;
  }

  // --- Paquetes (Combo) — match exacto de productVariantId+cantidad,
  // nunca se parte una línea (alcance explícito de esta primera versión).
  const combos = await tx.combo.findMany({
    where: { isActive: true },
    include: { items: { include: { productVariant: true } } },
  });
  function comboDiscount(combo: (typeof combos)[number]) {
    const normalTotal = combo.items.reduce(
      (sum, item) => sum.add(item.productVariant.price.mul(item.quantity)),
      new Prisma.Decimal(0)
    );
    return normalTotal.sub(combo.price);
  }
  // Un paquete solo se aplica si de verdad abarata: uno guardado con
  // precio >= a sus productos por separado (posible antes de validar al
  // crearlo) cobraba DE MÁS automáticamente sin que el cajero lo notara.
  const activeCombos = combos.filter(
    (c) => isPromotionActiveNow(c.daysOfWeek, c.startTime, c.endTime, now) && comboDiscount(c).greaterThan(0)
  );
  activeCombos.sort((a, b) => comboDiscount(b).sub(comboDiscount(a)).toNumber());

  for (const combo of activeCombos) {
    const matchedIndices: number[] = [];
    let allMatched = true;
    for (const comboItem of combo.items) {
      const matchIndex = saleItemsData.findIndex(
        (item, idx) =>
          isEligible(item) &&
          !matchedIndices.includes(idx) &&
          item.productVariantId === comboItem.productVariantId &&
          item.quantity === comboItem.quantity
      );
      if (matchIndex === -1) {
        allMatched = false;
        break;
      }
      matchedIndices.push(matchIndex);
    }
    if (!allMatched) continue;

    // Reparto proporcional al precio normal de cada línea, para que la
    // suma sea EXACTAMENTE combo.price — el último renglón absorbe el
    // redondeo, para no perder ni ganar centavos.
    const originalTotal = matchedIndices.reduce(
      (sum, idx) => sum.add(saleItemsData[idx].lineTotal),
      new Prisma.Decimal(0)
    );
    if (originalTotal.lessThanOrEqualTo(combo.price)) continue;
    recordSaving(combo.name, originalTotal.sub(combo.price));
    let assigned = new Prisma.Decimal(0);
    matchedIndices.forEach((idx, i) => {
      const isLast = i === matchedIndices.length - 1;
      const share = isLast
        ? combo.price.sub(assigned)
        : saleItemsData[idx].lineTotal.div(originalTotal).mul(combo.price).toDecimalPlaces(2);
      assigned = assigned.add(share);
      saleItemsData[idx].lineTotal = share;
      saleItemsData[idx].comboId = combo.id;
      saleItemsData[idx].hasAutomaticPromotion = true;
    });
  }

  // --- 2x1 — de cada 2 unidades de la línea, se cobra 1.
  const dosPorUnoPromotions = await tx.promotion.findMany({
    where: { isActive: true, category: "DOS_POR_UNO" },
    include: { variants: true },
  });
  const activeDosPorUno = dosPorUnoPromotions.filter((p) =>
    isPromotionActiveNow(p.daysOfWeek, p.startTime, p.endTime, now)
  );
  const dosPorUnoByVariantId = new Map<string, (typeof activeDosPorUno)[number]>();
  for (const promo of activeDosPorUno) {
    for (const v of promo.variants) {
      if (!dosPorUnoByVariantId.has(v.productVariantId)) dosPorUnoByVariantId.set(v.productVariantId, promo);
    }
  }

  for (const item of saleItemsData) {
    if (!isEligible(item)) continue;
    const promo = dosPorUnoByVariantId.get(item.productVariantId);
    if (!promo) continue;
    const chargeableQuantity = Math.ceil(item.quantity / 2);
    const newTotal = item.unitPrice.mul(chargeableQuantity);
    recordSaving(promo.name, item.lineTotal.sub(newTotal));
    item.lineTotal = newTotal;
    item.hasAutomaticPromotion = true;
  }

  // --- Día temático — descuento porcentaje/monto fijo/precio final
  // sobre la línea, vía el mismo computeDiscount que usan los
  // descuentos de venta completa.
  const diaTematicoPromotions = await tx.promotion.findMany({
    where: { isActive: true, category: "DIA_TEMATICO" },
    include: { variants: true },
  });
  const activeDiaTematico = diaTematicoPromotions.filter((p) =>
    isPromotionActiveNow(p.daysOfWeek, p.startTime, p.endTime, now)
  );
  const diaTematicoByVariantId = new Map<string, (typeof activeDiaTematico)[number]>();
  for (const promo of activeDiaTematico) {
    for (const v of promo.variants) {
      if (!diaTematicoByVariantId.has(v.productVariantId)) {
        diaTematicoByVariantId.set(v.productVariantId, promo);
      }
    }
  }

  for (const item of saleItemsData) {
    if (!isEligible(item)) continue;
    const promo = diaTematicoByVariantId.get(item.productVariantId);
    if (!promo || !promo.discountType || !promo.discountValue) continue;
    const discount = computeDiscount(promo.discountType, promo.discountValue, item.lineTotal);
    const newTotal = Prisma.Decimal.max(0, item.lineTotal.sub(discount));
    recordSaving(promo.name, item.lineTotal.sub(newTotal));
    item.lineTotal = newTotal;
    item.hasAutomaticPromotion = true;
  }

  // Subtotal "descontable" por DiscountCode/ManualDiscount — excluye las
  // líneas que ya recibieron una promoción automática, para que no se
  // apilen dos descuentos sobre la misma línea.
  const discountableSubtotal = saleItemsData
    .filter((item) => !item.hasAutomaticPromotion)
    .reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0));
  const applied = [...savings].map(([name, saving]) => ({ name, saving: saving.toNumber() }));
  return { discountableSubtotal, applied };
}

async function resolveSaleItems(
  tx: Prisma.TransactionClient,
  items: CreateSaleItemInput[]
): Promise<{
  saleItemsData: ResolvedSaleItem[];
  consumption: Map<string, Prisma.Decimal>;
  subtotal: Prisma.Decimal;
  discountableSubtotal: Prisma.Decimal;
  appliedPromotions: AppliedPromotion[];
}> {
  const ingredientInfoCache = new Map<string, { baseUnit: UnitOfMeasure; categoryId: string }>();
  const consumption = new Map<string, Prisma.Decimal>();

  async function getIngredientInfo(ingredientId: string) {
    let info = ingredientInfoCache.get(ingredientId);
    if (!info) {
      const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
      info = { baseUnit: ingredient.baseUnit, categoryId: ingredient.categoryId };
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

  // Precio al cliente de un extra libre:
  //   - Ingredient.extraUnitPrice si está definido (por unidad de
  //     standardDoseUnit, o de baseUnit si no tiene dosis estándar);
  //   - si no, costo cotizado ÷ % de food cost objetivo — el mismo margen
  //     que el precio sugerido de las recetas. Antes se cobraba el costo
  //     tal cual (ej. un shot extra a $5.40, sin ninguna ganancia).
  let targetFoodCostPercent: number | null = null;
  async function extraPriceDelta(ingredientId: string, baseQty: Prisma.Decimal) {
    const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    let price: Prisma.Decimal;
    if (ingredient.extraUnitPrice) {
      const pricingUnit = ingredient.standardDoseUnit ?? ingredient.baseUnit;
      const basePerPricingUnit = await toBaseUnit(ingredientId, new Prisma.Decimal(1), pricingUnit);
      price = baseQty.div(basePerPricingUnit).mul(ingredient.extraUnitPrice);
    } else {
      const supplierCost = await tx.ingredientSupplier.findFirst({
        where: { ingredientId, isSelected: true },
      });
      if (targetFoodCostPercent === null) {
        const branch = await tx.branch.findUnique({ where: { id: DEFAULT_BRANCH_ID } });
        targetFoodCostPercent = branch?.targetFoodCostPercent?.toNumber() ?? 30;
      }
      price = baseQty
        .mul(supplierCost?.cost ?? new Prisma.Decimal(0))
        .div(new Prisma.Decimal(targetFoodCostPercent).div(100));
    }
    return price.toDecimalPlaces(2);
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
        const { categoryId } = await getIngredientInfo(line.ingredientId);
        if (excludedCategories.has(categoryId)) continue; // sustituido, no se descuenta el ingrediente base
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

    // Extras libres: precio SIEMPRE calculado aquí, nunca confiado del
    // cliente (ver extraPriceDelta). Cantidad convertida a baseUnit antes
    // de costear/descontar (ver nota arriba).
    const resolvedExtras: ResolvedSaleItem["extraIngredients"] = [];
    let extrasTotal = new Prisma.Decimal(0);

    for (const extra of item.extraIngredients ?? []) {
      if (extra.quantity <= 0) {
        throw new Error("La cantidad de un ingrediente extra debe ser mayor a cero.");
      }
      const { baseUnit } = await getIngredientInfo(extra.ingredientId);
      const baseQty = await toBaseUnit(extra.ingredientId, new Prisma.Decimal(extra.quantity), extra.unit);
      const priceDelta = await extraPriceDelta(extra.ingredientId, baseQty);
      extrasTotal = extrasTotal.add(priceDelta);
      resolvedExtras.push({ ingredientId: extra.ingredientId, quantity: baseQty, baseUnit, priceDelta });
    }

    const unitPrice = variant.price.add(modifierTotal).add(extrasTotal);
    const lineTotal = unitPrice.mul(item.quantity);

    saleItemsData.push({
      productVariantId: variant.id,
      recipeVersionId: recipeVersion?.id ?? null,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      notes: item.notes?.trim() || null,
      modifiers: modifierOptions.map((opt) => ({ modifierOptionId: opt.id, priceDelta: opt.priceDelta })),
      extraIngredients: resolvedExtras,
      comboId: null,
      hasAutomaticPromotion: false,
    });

    const substitutionCategories = new Set<string>();
    for (const opt of modifierOptions) {
      if (opt.isSubstitution && opt.ingredientId) {
        const { categoryId } = await getIngredientInfo(opt.ingredientId);
        substitutionCategories.add(categoryId);
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

  const { discountableSubtotal, applied: appliedPromotions } = await applyPromotions(
    tx,
    saleItemsData,
    new Date()
  );
  const subtotal = saleItemsData.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0));

  return { saleItemsData, consumption, subtotal, discountableSubtotal, appliedPromotions };
}

// Insumos que no alcanzan para una ronda: consumo (en baseUnit) contra el
// stock actual de la ubicación por defecto. Antes se vendía sin revisar y
// el stock quedaba en negativo sin que nadie lo notara (QA-003). Política
// acordada: advertir y permitir solo si el cajero lo confirma.
export type StockShortage = { ingredientId: string; name: string; unit: string; missing: number };

async function findShortages(
  tx: Prisma.TransactionClient,
  consumption: Map<string, Prisma.Decimal>
): Promise<StockShortage[]> {
  const ids = [...consumption.keys()];
  if (ids.length === 0) return [];
  const [ingredients, stocks] = await Promise.all([
    tx.ingredient.findMany({ where: { id: { in: ids } } }),
    tx.inventoryStock.findMany({
      where: { ingredientId: { in: ids }, stockLocationId: DEFAULT_STOCK_LOCATION_ID },
    }),
  ]);
  const stockById = new Map(stocks.map((s) => [s.ingredientId, s.quantity]));
  const shortages: StockShortage[] = [];
  for (const ingredient of ingredients) {
    const required = consumption.get(ingredient.id) ?? new Prisma.Decimal(0);
    const available = stockById.get(ingredient.id) ?? new Prisma.Decimal(0);
    if (required.greaterThan(available)) {
      shortages.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: unitLabel(ingredient.baseUnit),
        missing: required.sub(Prisma.Decimal.max(available, 0)).toDecimalPlaces(2).toNumber(),
      });
    }
  }
  return shortages;
}

function describeShortages(shortages: StockShortage[]) {
  return shortages.map((s) => `${s.name} (faltan ${s.missing} ${s.unit})`).join(", ");
}

async function assertStockOrAllowed(
  tx: Prisma.TransactionClient,
  consumption: Map<string, Prisma.Decimal>,
  allowShortage: boolean | undefined
) {
  if (allowShortage) return;
  const shortages = await findShortages(tx, consumption);
  if (shortages.length > 0) {
    throw new Error(`${SHORTAGE_ERROR_PREFIX} ${describeShortages(shortages)}.`);
  }
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
        comboId: item.comboId,
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

async function findSaleByClientRequestId(clientRequestId: string | undefined) {
  if (!clientRequestId) return null;
  return prisma.sale.findUnique({ where: { clientRequestId } });
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
// Vista previa de precio para el carrito del POS — resolveSaleItems ya
// resuelve modificadores/extras/promociones automáticas, pero eso solo
// corre dentro de createSale/openTab/etc. al cobrar de verdad. Sin esto,
// el carrito solo sabe sumar quantity×unitPrice del lado del cliente, que
// NO refleja Paquetes/2x1/Día temático — el cajero vería un total
// distinto al que de verdad se cobra, y el monto que captura en efectivo
// no cuadraría con createSale (que sí exige que coincidan exactos). Es de
// solo lectura (ninguna de las consultas dentro de resolveSaleItems
// escribe nada), por eso se llama con el cliente de Prisma normal, sin
// transacción.
export const previewSaleTotal = safeAction(async function previewSaleTotal(
  employeeId: string,
  items: CreateSaleItemInput[]
): Promise<{
  subtotal: number;
  discountableSubtotal: number;
  appliedPromotions: AppliedPromotion[];
  shortages: StockShortage[];
}> {
  await assertSessionEmployee(employeeId);
  if (items.length === 0) {
    return { subtotal: 0, discountableSubtotal: 0, appliedPromotions: [], shortages: [] };
  }

  const { subtotal, discountableSubtotal, appliedPromotions, consumption } = await resolveSaleItems(prisma, items);
  return {
    subtotal: subtotal.toNumber(),
    discountableSubtotal: discountableSubtotal.toNumber(),
    appliedPromotions,
    shortages: await findShortages(prisma, consumption),
  };
});

export const createSale = safeAction(async function createSale(input: CreateSaleInput) {
  await assertSessionEmployee(input.employeeId);
  if (input.items.length === 0) {
    throw new Error("La venta no tiene productos.");
  }

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const alreadyRegistered = await findSaleByClientRequestId(input.clientRequestId);
  if (alreadyRegistered) return serializeSale(alreadyRegistered);

  const sale = await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift || shift.status !== "ABIERTO" || shift.branchId !== input.branchId) {
      throw new Error("No hay un turno abierto válido para esta venta.");
    }

    const { saleItemsData, consumption, subtotal, discountableSubtotal } = await resolveSaleItems(tx, input.items);
    await assertStockOrAllowed(tx, consumption, input.allowShortage);

    // A domicilio: sin cliente con dirección no hay a dónde entregar
    // (QA-012). El POS guarda la dirección capturada antes de cobrar.
    if (input.orderType === "DOMICILIO") {
      const customer = input.customerId
        ? await tx.customer.findUnique({ where: { id: input.customerId } })
        : null;
      if (!customer) {
        throw new Error("Un pedido a domicilio necesita un cliente.");
      }
      if (!customer.address?.trim()) {
        throw new Error("Captura el domicilio de entrega del cliente.");
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

    // El código/descuento manual se calcula solo sobre discountableSubtotal
    // (el subtotal SIN las líneas que ya recibieron una promoción
    // automática — Paquetes/2x1/Día temático, ver applyPromotions) para
    // que una línea nunca lleve dos descuentos a la vez.
    if (input.discountCodeId) {
      await requirePermission(input.employeeId, input.branchId, "DESCUENTO_APLICAR_CODIGO");
      discountTotal = await validateAndConsumeDiscountCode(tx, {
        discountCodeId: input.discountCodeId,
        customerId: input.customerId,
        subtotal: discountableSubtotal,
      });
    }

    if (input.manualDiscount) {
      const authorizer = await findEmployeeByPin(input.manualDiscount.authorizingPin);
      if (!authorizer) {
        throw new Error("PIN de autorización incorrecto.");
      }
      await requirePermission(authorizer.id, input.branchId, "DESCUENTO_MANUAL");

      const value = new Prisma.Decimal(input.manualDiscount.value);
      discountTotal = computeDiscount(input.manualDiscount.type, value, discountableSubtotal);
      manualDiscountData = {
        type: input.manualDiscount.type,
        value,
        reason: input.manualDiscount.reason,
        authorizedById: authorizer.id,
      };
    }

    if (discountTotal.lessThan(0) || discountTotal.greaterThan(discountableSubtotal)) {
      throw new Error("El descuento no puede ser mayor al subtotal de la venta.");
    }

    const total = subtotal.sub(discountTotal);

    const tipAmount = validateTipAmount(input.tipAmount);
    const paymentsTotal = input.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentsTotal - total.add(tipAmount).toNumber()) > 0.01) {
      throw new Error("El total pagado no coincide con el total de la venta más la propina.");
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
        tipAmount,
        clientRequestId: input.clientRequestId || null,
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
});

// -----------------------------------------------------------------------
// Cuentas abiertas (Mesa) — "cambios para la sección de punto de venta":
// una cuenta puede quedar abierta (Sale.status = ABIERTA) para seguir
// agregando rondas de productos y cobrarla después, mientras el cajero
// atiende otras cuentas en paralelo. El inventario se descuenta ronda
// por ronda (la bebida se prepara al pedirse), no hasta que se cobra.
// -----------------------------------------------------------------------

export type OpenTabInput = {
  // El cajero ya vio la advertencia de insumos insuficientes y decidió
  // vender de todos modos (ver findShortages).
  allowShortage?: boolean;
  branchId: string;
  shiftId: string;
  employeeId: string;
  tableNumber: string;
  items: CreateSaleItemInput[];
  customerId?: string;
};

export const openTab = safeAction(async function openTab(input: OpenTabInput) {
  await assertSessionEmployee(input.employeeId);
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

    // Dos cuentas abiertas con el mismo número de mesa son ambiguas al
    // retomarlas/cobrarlas — si la mesa ya tiene cuenta, se le agrega ahí.
    const tableNumber = input.tableNumber.trim();
    const existingTab = await tx.sale.findFirst({
      where: {
        branchId: input.branchId,
        status: "ABIERTA",
        tableNumber: { equals: tableNumber, mode: "insensitive" },
      },
    });
    if (existingTab) {
      throw new Error(
        `La mesa ${tableNumber} ya tiene una cuenta abierta. Retómala desde "Cuentas abiertas" para agregarle productos.`
      );
    }

    const { saleItemsData, consumption, subtotal } = await resolveSaleItems(tx, input.items);
    await assertStockOrAllowed(tx, consumption, input.allowShortage);

    const createdSale = await tx.sale.create({
      data: {
        branchId: input.branchId,
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        status: "ABIERTA",
        orderType: "CONSUMO_LOCAL",
        tableNumber,
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
});

// Para cerrar una cuenta abierta (closeTab): el descuento de código/manual
// se calcula sobre el subtotal acumulado de TODAS las rondas ya
// persistidas, no solo la última — así que hay que re-derivar qué líneas
// ya persistidas recibieron una promoción automática (Paquetes/2x1/Día
// temático) para excluirlas, igual que discountableSubtotal en
// resolveSaleItems/applyPromotions. No hace falta una columna nueva: un
// SaleItem con comboId (Paquetes) o cuyo lineTotal ya no es
// unitPrice×quantity (2x1/Día temático, la única forma en que eso pasa
// para una línea sin modificadores que sumen al precio) ya quedó
// marcado por una promoción.
async function computeDiscountableSubtotal(tx: Prisma.TransactionClient, saleId: string): Promise<Prisma.Decimal> {
  const items = await tx.saleItem.findMany({ where: { saleId } });
  return items.reduce((sum, item) => {
    const hasPromotion = item.comboId !== null || !item.lineTotal.equals(item.unitPrice.mul(item.quantity));
    return hasPromotion ? sum : sum.add(item.lineTotal);
  }, new Prisma.Decimal(0));
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
  // El cajero ya vio la advertencia de insumos insuficientes y decidió
  // vender de todos modos (ver findShortages).
  allowShortage?: boolean;
  saleId: string;
  branchId: string;
  shiftId: string;
  employeeId: string;
  items: CreateSaleItemInput[];
};

export const addItemsToTab = safeAction(async function addItemsToTab(input: AddItemsToTabInput) {
  await assertSessionEmployee(input.employeeId);
  if (input.items.length === 0) {
    throw new Error("La ronda no tiene productos.");
  }

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  const sale = await prisma.$transaction(async (tx) => {
    const existing = await loadOpenTab(tx, input.saleId, input.branchId, input.shiftId);
    const { saleItemsData, consumption, subtotal } = await resolveSaleItems(tx, input.items);
    await assertStockOrAllowed(tx, consumption, input.allowShortage);

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
});

export type CloseTabInput = {
  // Id del intento de cobro (ver Sale.clientRequestId): un reintento con
  // el mismo id regresa la venta ya registrada en vez de duplicarla.
  clientRequestId?: string;
  // El cajero ya vio la advertencia de insumos insuficientes y decidió
  // vender de todos modos (ver findShortages).
  allowShortage?: boolean;
  saleId: string;
  branchId: string;
  shiftId: string;
  employeeId: string;
  // Última ronda de productos, si se agrega justo al cobrar.
  items?: CreateSaleItemInput[];
  payments: { method: PaymentMethod; amount: number; note?: string }[];
  tipAmount?: number;
  customerId?: string;
  discountCodeId?: string;
  manualDiscount?: ManualDiscountInput;
};

export const closeTab = safeAction(async function closeTab(input: CloseTabInput) {
  await assertSessionEmployee(input.employeeId);

  await requirePermission(input.employeeId, input.branchId, "VENTA_REALIZAR");

  // Reintento de un cobro que sí se registró (la respuesta se perdió): la
  // cuenta ya está COMPLETADA con este mismo id — se regresa tal cual.
  const alreadyClosed = await findSaleByClientRequestId(input.clientRequestId);
  if (alreadyClosed && alreadyClosed.id === input.saleId) return serializeSale(alreadyClosed);

  const sale = await prisma.$transaction(async (tx) => {
    let existing = await loadOpenTab(tx, input.saleId, input.branchId, input.shiftId);

    if (input.items && input.items.length > 0) {
      const { saleItemsData, consumption, subtotal: roundSubtotal } = await resolveSaleItems(tx, input.items);
      await assertStockOrAllowed(tx, consumption, input.allowShortage);
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
    // base del total — una cuenta abierta no carga descuento hasta que
    // se cierra.
    const subtotal = existing.subtotal;
    // El código/descuento manual, en cambio, solo se calcula sobre lo
    // que NO recibió ya una promoción automática en alguna ronda previa
    // (ver computeDiscountableSubtotal) — misma regla de "no apilar"
    // que createSale.
    const discountableSubtotal = await computeDiscountableSubtotal(tx, existing.id);

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
      discountTotal = await validateAndConsumeDiscountCode(tx, {
        discountCodeId: input.discountCodeId,
        customerId: input.customerId || existing.customerId || undefined,
        subtotal: discountableSubtotal,
      });
    }

    if (input.manualDiscount) {
      const authorizer = await findEmployeeByPin(input.manualDiscount.authorizingPin);
      if (!authorizer) {
        throw new Error("PIN de autorización incorrecto.");
      }
      await requirePermission(authorizer.id, input.branchId, "DESCUENTO_MANUAL");

      const value = new Prisma.Decimal(input.manualDiscount.value);
      discountTotal = computeDiscount(input.manualDiscount.type, value, discountableSubtotal);
      manualDiscountData = {
        type: input.manualDiscount.type,
        value,
        reason: input.manualDiscount.reason,
        authorizedById: authorizer.id,
      };
    }

    if (discountTotal.lessThan(0) || discountTotal.greaterThan(discountableSubtotal)) {
      throw new Error("El descuento no puede ser mayor al subtotal de la cuenta.");
    }

    const total = subtotal.sub(discountTotal);

    const tipAmount = validateTipAmount(input.tipAmount);
    const paymentsTotal = input.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentsTotal - total.add(tipAmount).toNumber()) > 0.01) {
      throw new Error("El total pagado no coincide con el total de la cuenta más la propina.");
    }

    const customerId = input.customerId || existing.customerId || null;

    const closedSale = await tx.sale.update({
      where: { id: existing.id },
      data: {
        status: "COMPLETADA",
        clientRequestId: input.clientRequestId || null,
        discountTotal,
        total,
        tipAmount,
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
});

export type OpenTabSummary = {
  id: string;
  tableNumber: string | null;
  total: number;
  itemCount: number;
  createdAt: string;
};

export const listOpenTabs = safeAction(async function listOpenTabs(branchId: string): Promise<OpenTabSummary[]> {
  const employeeId = await getSessionEmployeeId();
  if (!employeeId) {
    throw new SessionExpiredError("Necesitas iniciar sesión para ver las cuentas abiertas.");
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
});

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
export const getTabDetail = safeAction(async function getTabDetail(saleId: string): Promise<OpenTabDetail> {
  if (!(await getSessionEmployeeId())) {
    throw new SessionExpiredError("Necesitas iniciar sesión para ver la cuenta.");
  }
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
});

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
export const removeTabItem = safeAction(async function removeTabItem(input: RemoveTabItemInput) {
  await assertSessionEmployee(input.employeeId);
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
});

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
export const updateTabItemQuantity = safeAction(async function updateTabItemQuantity(input: UpdateTabItemQuantityInput) {
  await assertSessionEmployee(input.employeeId);
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
});

export type CancelSaleInput = {
  saleId: string;
  branchId: string;
  shiftId: string;
  employeeId: string;
  authorizingPin: string;
  reason: string;
};

// Anular una venta cobrada o una cuenta abierta del turno actual. Exige el
// PIN de alguien con VENTA_CANCELAR (como el descuento manual) y un
// motivo. Revierte exactamente lo que la venta movió:
//   - Inventario: suma los InventoryMovement que la venta generó (notas
//     "Venta <id>" de applyConsumption y "Corrección cuenta <id>" de las
//     correcciones de cuentas abiertas) y registra el movimiento inverso.
//   - Cupón de un solo uso: vuelve a quedar disponible.
//   - Lealtad: quita el sello que dio la venta.
// La venta queda CANCELADA (no se borra): reportes, corte de caja y
// lealtad ya filtran por COMPLETADA, así que deja de contar en todos.
export const cancelSale = safeAction(async function cancelSale(input: CancelSaleInput) {
  await assertSessionEmployee(input.employeeId);
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Captura el motivo de la anulación.");
  }
  const authorizer = await findEmployeeByPin(input.authorizingPin.trim());
  if (!authorizer) {
    throw new Error("PIN de autorización incorrecto.");
  }
  await requirePermission(authorizer.id, input.branchId, "VENTA_CANCELAR");

  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { shift: true } });
    if (!sale || sale.branchId !== input.branchId) {
      throw new Error("La venta no existe.");
    }
    if (sale.status === "CANCELADA") {
      throw new Error("Esta venta ya estaba anulada.");
    }
    if (sale.shiftId !== input.shiftId || sale.shift.status !== "ABIERTO") {
      throw new Error("Solo se pueden anular ventas del turno abierto.");
    }

    const movements = await tx.inventoryMovement.groupBy({
      by: ["ingredientId", "stockLocationId", "unit"],
      where: { notes: { in: [`Venta ${sale.id}`, `Corrección cuenta ${sale.id}`] } },
      _sum: { quantity: true },
    });
    for (const movement of movements) {
      const consumed = movement._sum.quantity ?? new Prisma.Decimal(0);
      if (consumed.isZero()) continue;
      const restock = consumed.negated();
      await tx.inventoryStock.update({
        where: {
          ingredientId_stockLocationId: {
            ingredientId: movement.ingredientId,
            stockLocationId: movement.stockLocationId,
          },
        },
        data: { quantity: { increment: restock } },
      });
      await tx.inventoryMovement.create({
        data: {
          type: "VENTA",
          ingredientId: movement.ingredientId,
          stockLocationId: movement.stockLocationId,
          quantity: restock,
          unit: movement.unit,
          branchId: sale.branchId,
          employeeId: input.employeeId,
          shiftId: sale.shiftId,
          notes: `Anulación venta ${sale.id}`,
        },
      });
    }

    if (sale.discountCodeId) {
      const code = await tx.discountCode.findUnique({ where: { id: sale.discountCodeId } });
      if (code?.customerId && code.usedAt) {
        await tx.discountCode.update({ where: { id: code.id }, data: { usedAt: null } });
      }
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "CANCELADA",
        cancelledAt: new Date(),
        cancelledById: authorizer.id,
        cancelReason: reason,
      },
    });

    if (sale.status === "COMPLETADA" && sale.customerId) {
      await removeLoyaltyStamp(tx, sale.customerId);
    }
  });

  revalidatePath("/pos");
  revalidatePath("/caja");
});

// Inverso de applyLoyaltyStamp: los sellos se reinician a 0 al llegar a 5,
// así que quitar uno desde 0 regresa a 4 (la venta anulada fue la que
// completó la tarjeta). El nivel se recalcula con las ventas COMPLETADA
// restantes.
async function removeLoyaltyStamp(tx: Prisma.TransactionClient, customerId: string) {
  const card = await tx.loyaltyCard.findUnique({ where: { customerId } });
  if (!card) return;

  const lifetimeStamps = await tx.sale.count({ where: { customerId, status: "COMPLETADA" } });
  const newStamps = card.stamps > 0 ? card.stamps - 1 : lifetimeStamps > 0 ? 4 : 0;
  const eligibleTier = await tx.loyaltyTier.findFirst({
    where: { minLifetimeStamps: { lte: lifetimeStamps } },
    orderBy: { minLifetimeStamps: "desc" },
  });

  await tx.loyaltyCard.update({
    where: { customerId },
    data: { stamps: newStamps, tierId: eligibleTier?.id ?? null },
  });
}
