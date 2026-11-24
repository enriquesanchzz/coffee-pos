import { prisma } from "./prisma";
import type { PromotionCategory, DiscountType, VariantTemperature } from "@prisma/client";

const TEMPERATURE_LABELS: Record<VariantTemperature, string> = {
  CALIENTE: "Caliente",
  FRIO: "Fría",
  FRAPPE: "Frappé",
};

// Dos variantes de un mismo producto pueden compartir nombre y diferir
// solo en temperatura (ej. "Americano Chico" Caliente vs. Frío) — sin
// esto, cualquier lista/selector sería ambiguo.
function variantDisplayName(name: string, temperature: VariantTemperature | null) {
  return temperature ? `${name} — ${TEMPERATURE_LABELS[temperature]}` : name;
}

// Lista plana de variantes activas, para los selectores de Paquetes/2x1/
// Día temático (elegir qué productos califican) — no hace falta el árbol
// de categorías completo de lib/catalog.ts, solo nombre + precio.
// `variantName` incluye la temperatura cuando aplica (ej. "Chico —
// Caliente") porque dos variantes de un mismo producto pueden compartir
// el mismo nombre de tamaño y diferir solo en temperatura (ej. "Americano
// Chico" Caliente vs. Frío) — sin esto, el selector sería ambiguo.
export type VariantOption = {
  id: string;
  productName: string;
  variantName: string;
  price: number;
};

export async function getVariantOptions(): Promise<VariantOption[]> {
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true },
    include: { product: true },
    orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
  });
  return variants.map((v) => ({
    id: v.id,
    productName: v.product.name,
    variantName: variantDisplayName(v.name, v.temperature),
    price: v.price.toNumber(),
  }));
}

// Para armar un Paquete (Combo): a diferencia de 2x1/Día temático, un
// paquete combina por PRODUCTO completo — cualquier variante activa
// cuenta para esa línea (ver ComboItem en el schema y applyPromotions en
// actions/pos.ts). minPrice es solo una referencia conservadora para
// mostrar el ahorro estimado en el editor.
export type ProductOption = {
  id: string;
  name: string;
  minPrice: number;
};

export async function getProductOptions(): Promise<ProductOption[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true, variants: { some: { isActive: true } } },
    include: { variants: { where: { isActive: true } } },
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    minPrice: Math.min(...p.variants.map((v) => v.price.toNumber())),
  }));
}

export type ComboItemListItem = {
  productId: string;
  productName: string;
  quantity: number;
};

export type ComboListItem = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  items: ComboItemListItem[];
};

export async function getCombos(): Promise<ComboListItem[]> {
  const combos = await prisma.combo.findMany({
    orderBy: { name: "asc" },
    include: { items: { include: { product: true } } },
  });
  return combos.map((combo) => ({
    id: combo.id,
    name: combo.name,
    price: combo.price.toNumber(),
    isActive: combo.isActive,
    daysOfWeek: combo.daysOfWeek,
    startTime: combo.startTime,
    endTime: combo.endTime,
    items: combo.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
    })),
  }));
}

export type PromotionListItem = {
  id: string;
  name: string;
  category: PromotionCategory;
  isActive: boolean;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  variants: { productVariantId: string; productName: string; variantName: string }[];
};

export async function getPromotions(): Promise<PromotionListItem[]> {
  const promotions = await prisma.promotion.findMany({
    orderBy: { name: "asc" },
    include: { variants: { include: { productVariant: { include: { product: true } } } } },
  });
  return promotions.map((promo) => ({
    id: promo.id,
    name: promo.name,
    category: promo.category,
    isActive: promo.isActive,
    daysOfWeek: promo.daysOfWeek,
    startTime: promo.startTime,
    endTime: promo.endTime,
    discountType: promo.discountType,
    discountValue: promo.discountValue?.toNumber() ?? null,
    variants: promo.variants.map((v) => ({
      productVariantId: v.productVariantId,
      productName: v.productVariant.product.name,
      variantName: variantDisplayName(v.productVariant.name, v.productVariant.temperature),
    })),
  }));
}
