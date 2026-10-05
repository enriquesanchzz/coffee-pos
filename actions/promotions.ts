"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import type { PromotionCategory, DiscountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId, assertSessionEmployee } from "@/lib/session";
import { requirePermission, requireAdminRole } from "@/lib/permissions";

async function assertActor(employeeId: string) {
  await assertSessionEmployee(employeeId);
  await requirePermission(employeeId, DEFAULT_BRANCH_ID, "PROMOCION_GESTIONAR");
  await requireAdminRole(employeeId, DEFAULT_BRANCH_ID);
}

// -----------------------------------------------------------------------
// Paquetes precio reducido — Combo/ComboItem ya existían en el schema
// (nunca se habían implementado). Un combo no se puede borrar (tiene
// SaleItem[] — ventas históricas que lo referencian), solo desactivar.
// -----------------------------------------------------------------------

export type ComboItemInput = { productVariantId: string; quantity: number };

export type CreateComboInput = {
  employeeId: string;
  name: string;
  price: number;
  items: ComboItemInput[];
  daysOfWeek: number[];
  startTime?: string | null;
  endTime?: string | null;
};

function validateComboInput(input: { name: string; price: number; items: ComboItemInput[] }) {
  if (!input.name.trim()) {
    throw new Error("El nombre del paquete es obligatorio.");
  }
  if (input.price <= 0) {
    throw new Error("El precio del paquete debe ser mayor a cero.");
  }
  if (input.items.length < 2) {
    throw new Error("Un paquete necesita al menos 2 productos combinados.");
  }
  for (const item of input.items) {
    if (!item.productVariantId) {
      throw new Error("Falta elegir un producto en una de las líneas del paquete.");
    }
    if (item.quantity <= 0) {
      throw new Error("La cantidad de cada línea del paquete debe ser mayor a cero.");
    }
  }
}

// Un paquete debe costar MENOS que sus productos por separado — uno más
// caro se aplicaba solo en el POS y cobraba de más sin que el cajero lo
// notara (QA-002). applyPromotions también lo ignora por si quedó alguno
// guardado de antes.
async function assertComboIsCheaper(price: number, items: ComboItemInput[]) {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((item) => item.productVariantId) } },
  });
  const priceById = new Map(variants.map((v) => [v.id, v.price.toNumber()]));
  const normalTotal = items.reduce(
    (sum, item) => sum + (priceById.get(item.productVariantId) ?? 0) * item.quantity,
    0
  );
  if (price >= normalTotal) {
    throw new Error(
      `El paquete debe costar menos que sus productos por separado ($${normalTotal.toFixed(2)}).`
    );
  }
}

export const createCombo = safeAction(async function createCombo(input: CreateComboInput) {
  await assertActor(input.employeeId);
  validateComboInput(input);
  await assertComboIsCheaper(input.price, input.items);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: input.items.map((item) => item.productVariantId) } },
  });
  const productIdByVariantId = new Map(variants.map((v) => [v.id, v.productId]));

  await prisma.combo.create({
    data: {
      name: input.name.trim(),
      price: input.price,
      daysOfWeek: input.daysOfWeek,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      items: {
        create: input.items.map((item) => {
          const productId = productIdByVariantId.get(item.productVariantId);
          if (!productId) {
            throw new Error("Uno de los productos del paquete ya no existe.");
          }
          return { productVariantId: item.productVariantId, productId, quantity: item.quantity };
        }),
      },
    },
  });

  revalidatePath("/promociones");
});

export type UpdateComboInput = CreateComboInput & { comboId: string; isActive: boolean };

export const updateCombo = safeAction(async function updateCombo(input: UpdateComboInput) {
  await assertActor(input.employeeId);
  validateComboInput(input);
  await assertComboIsCheaper(input.price, input.items);

  await prisma.$transaction(async (tx) => {
    await tx.combo.update({
      where: { id: input.comboId },
      data: {
        name: input.name.trim(),
        price: input.price,
        isActive: input.isActive,
        daysOfWeek: input.daysOfWeek,
        startTime: input.startTime || null,
        endTime: input.endTime || null,
      },
    });

    await tx.comboItem.deleteMany({ where: { comboId: input.comboId } });
    for (const item of input.items) {
      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: item.productVariantId } });
      await tx.comboItem.create({
        data: {
          comboId: input.comboId,
          productId: variant.productId,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
        },
      });
    }
  });

  revalidatePath("/promociones");
});

// -----------------------------------------------------------------------
// 2x1 y Día temático — Promotion/PromotionVariant (nuevos).
// -----------------------------------------------------------------------

export type CreatePromotionInput = {
  employeeId: string;
  name: string;
  category: PromotionCategory;
  variantIds: string[];
  daysOfWeek: number[];
  startTime?: string | null;
  endTime?: string | null;
  // Solo DIA_TEMATICO.
  discountType?: DiscountType;
  discountValue?: number;
};

function validatePromotionInput(input: {
  name: string;
  category: PromotionCategory;
  variantIds: string[];
  discountType?: DiscountType;
  discountValue?: number;
}) {
  if (!input.name.trim()) {
    throw new Error("El nombre de la promoción es obligatorio.");
  }
  if (input.variantIds.length === 0) {
    throw new Error("Elige al menos un producto para la promoción.");
  }
  if (input.category === "DIA_TEMATICO") {
    if (!input.discountType) {
      throw new Error("Un día temático necesita un tipo de descuento.");
    }
    if (!(input.discountValue && input.discountValue > 0)) {
      throw new Error("El valor del descuento debe ser mayor a cero.");
    }
  }
}

export const createPromotion = safeAction(async function createPromotion(input: CreatePromotionInput) {
  await assertActor(input.employeeId);
  validatePromotionInput(input);

  await prisma.promotion.create({
    data: {
      name: input.name.trim(),
      category: input.category,
      daysOfWeek: input.daysOfWeek,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      discountType: input.category === "DIA_TEMATICO" ? input.discountType : null,
      discountValue: input.category === "DIA_TEMATICO" ? input.discountValue : null,
      variants: { create: input.variantIds.map((productVariantId) => ({ productVariantId })) },
    },
  });

  revalidatePath("/promociones");
});

export type UpdatePromotionInput = CreatePromotionInput & { promotionId: string; isActive: boolean };

export const updatePromotion = safeAction(async function updatePromotion(input: UpdatePromotionInput) {
  await assertActor(input.employeeId);
  validatePromotionInput(input);

  await prisma.$transaction(async (tx) => {
    await tx.promotion.update({
      where: { id: input.promotionId },
      data: {
        name: input.name.trim(),
        category: input.category,
        isActive: input.isActive,
        daysOfWeek: input.daysOfWeek,
        startTime: input.startTime || null,
        endTime: input.endTime || null,
        discountType: input.category === "DIA_TEMATICO" ? input.discountType : null,
        discountValue: input.category === "DIA_TEMATICO" ? input.discountValue : null,
      },
    });

    await tx.promotionVariant.deleteMany({ where: { promotionId: input.promotionId } });
    await tx.promotionVariant.createMany({
      data: input.variantIds.map((productVariantId) => ({ promotionId: input.promotionId, productVariantId })),
    });
  });

  revalidatePath("/promociones");
});
