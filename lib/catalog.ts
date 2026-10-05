import type { VariantTemperature } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "./constants";

export type { VariantTemperature };

export type CatalogModifierOption = {
  id: string;
  name: string;
  priceDelta: number;
  isSubstitution: boolean;
};

export type CatalogModifierGroup = {
  id: string;
  name: string;
  isRequired: boolean;
  allowMultiple: boolean;
  options: CatalogModifierOption[];
};

export type CatalogVariant = {
  id: string;
  name: string;
  price: number;
  // sizeLabel es siempre el `name` de la variante (ej. "Chico") —
  // temperature es un campo real (ProductVariant.temperature), no un
  // sufijo en el nombre. Si un producto tiene variantes con ambos
  // tamaño y temperatura, el POS puede mostrar dos selectores en vez de
  // una lista plana; si no usa el eje de temperatura (como Capuccino),
  // temperature queda null y el comportamiento es idéntico al de un
  // producto con un solo eje.
  sizeLabel: string | null;
  temperature: VariantTemperature | null;
  modifierGroups: CatalogModifierGroup[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  variants: CatalogVariant[];
  // True cuando algún insumo directo de la receta de TODAS las variantes
  // tiene existencia registrada en 0 o menos. Solo informativo: el POS no
  // bloquea la venta, porque el conteo puede estar desfasado.
  outOfStock: boolean;
};

// parentId/parentName: árbol de 2 niveles (ver ProductCategory en el
// schema). Una categoría sin padre (parentId null) es su propio nivel
// superior en la nav — ej. "Café en grano", que no tiene hijas.
export type CatalogCategory = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  parentName: string | null;
  products: CatalogProduct[];
};

// Resuelve la variante exacta para una combinación tamaño×temperatura.
// Si el producto no usa esos ejes (sizeLabel/temperature en null en todas
// sus variantes), regresa la primera. Si los usa pero la combinación
// pedida no existe como variante real (grid incompleto), regresa `null`
// — nunca cae en variants[0] por error (bug real corregido: ver
// docs/CONTINUE.md, "Cambios Punto de Venta"). Compartida por
// ProductCard y ProductDialog para no duplicar esta lógica sensible.
export function resolveProductVariant(
  product: CatalogProduct,
  sizeLabel: string | null,
  temperature: VariantTemperature | null
): CatalogVariant | null {
  const hasSizes = product.variants.some((v) => v.sizeLabel !== null);
  const hasTemperatures = product.variants.some((v) => v.temperature !== null);

  if (!hasSizes && !hasTemperatures) {
    return product.variants[0] ?? null;
  }

  return (
    product.variants.find(
      (v) =>
        (!hasSizes || v.sizeLabel === sizeLabel) &&
        (!hasTemperatures || v.temperature === temperature)
    ) ?? null
  );
}

// Catálogo disponible para vender: categorías -> productos activos y
// habilitados en la sucursal (BranchProduct.isActive) -> variantes activas
// -> grupos de modificadores con sus opciones. Categorías/productos sin
// nada vendible se omiten para no ensuciar la UI del POS.
export async function getCatalog(
  branchId: string = DEFAULT_BRANCH_ID
): Promise<CatalogCategory[]> {
  const categories = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
    include: {
      parent: true,
      products: {
        where: {
          isActive: true,
          branchProducts: { some: { branchId, isActive: true } },
        },
        orderBy: { name: "asc" },
        include: {
          variants: {
            where: { isActive: true },
            orderBy: { price: "asc" },
            include: {
              modifierGroups: {
                include: { options: { orderBy: { name: "asc" } } },
              },
            },
          },
        },
      },
    },
  });

  const variantIds = categories.flatMap((c) => c.products.flatMap((p) => p.variants.map((v) => v.id)));
  const [recipes, stocks] = await Promise.all([
    prisma.recipe.findMany({
      where: { productVariantId: { in: variantIds }, kind: "PRODUCTO_VENDIBLE" },
      include: {
        versions: {
          where: { isActive: true },
          take: 1,
          include: { ingredients: { select: { ingredientId: true } } },
        },
      },
    }),
    prisma.inventoryStock.findMany({
      where: { stockLocationId: DEFAULT_STOCK_LOCATION_ID },
      select: { ingredientId: true, quantity: true },
    }),
  ]);

  const stockByIngredient = new Map(stocks.map((s) => [s.ingredientId, Number(s.quantity)]));
  const unavailableVariantIds = new Set<string>();
  for (const recipe of recipes) {
    if (!recipe.productVariantId) continue;
    const ingredients = recipe.versions[0]?.ingredients ?? [];
    const depleted = ingredients.some(
      (line) => line.ingredientId !== null && (stockByIngredient.get(line.ingredientId) ?? 1) <= 0
    );
    if (depleted) unavailableVariantIds.add(recipe.productVariantId);
  }

  return categories
    .filter((category) => category.products.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      parentId: category.parentId,
      parentName: category.parent?.name ?? null,
      products: category.products.map((product) => ({
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        outOfStock:
          product.variants.length > 0 && product.variants.every((v) => unavailableVariantIds.has(v.id)),
        variants: product.variants.map((variant) => {
          return {
            id: variant.id,
            name: variant.name,
            price: Number(variant.price),
            sizeLabel: variant.name,
            temperature: variant.temperature,
            modifierGroups: variant.modifierGroups.map((group) => ({
              id: group.id,
              name: group.name,
              isRequired: group.isRequired,
              allowMultiple: group.allowMultiple,
              options: group.options.map((option) => ({
                id: option.id,
                name: option.name,
                priceDelta: Number(option.priceDelta),
                isSubstitution: option.isSubstitution,
              })),
            })),
          };
        }),
      })),
    }));
}

export type ExtraIngredientOption = {
  id: string;
  name: string;
  baseUnit: string;
  // Costo cotizado en Compras (IngredientSupplier.isSelected), 0 si
  // nadie lo ha cotizado — YA convertido a costo por standardDoseUnit
  // cuando existe (ver abajo), para que "cantidad × unitCost" en el
  // cliente sea correcto sin que el cliente necesite conocer factores de
  // conversión.
  unitCost: number;
  // Precio al cliente por la misma unidad que unitCost: extraUnitPrice del
  // ingrediente, o unitCost ÷ % de food cost objetivo si no tiene.
  unitPrice: number;
  // Dosis estándar de captura (ej. "1 pump" de vainilla, "30 ml" de
  // leche) — el diálogo de "agregar otro ingrediente" la usa como valor
  // inicial en vez de "1" del baseUnit crudo. null = sigue usando
  // baseUnit con cantidad "1", como antes.
  standardDoseQuantity: number | null;
  standardDoseUnit: string | null;
};

// Para "agregar otro ingrediente" libre en el POS (fuera de los
// ModifierOption curados) — el precio que ve el barista aquí es solo vista
// previa, actions/pos.ts recalcula el precio real con el mismo criterio al
// confirmar la venta.
export async function getExtraIngredientOptions(): Promise<ExtraIngredientOption[]> {
  const [ingredients, conversions, targetFoodCostPercent] = await Promise.all([
    prisma.ingredient.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { suppliers: { where: { isSelected: true }, take: 1 } },
    }),
    prisma.unitConversion.findMany(),
    // Mismo default (30%) que getTargetFoodCostPercent en lib/recipes.ts —
    // no se importa de ahí porque este módulo también lo cargan componentes
    // cliente (tipos) y lib/recipes arrastra código server-only.
    prisma.branch
      .findUnique({ where: { id: DEFAULT_BRANCH_ID } })
      .then((branch) => branch?.targetFoodCostPercent?.toNumber() ?? 30),
  ]);

  return ingredients.map((ingredient) => {
    const costPerBaseUnit = ingredient.suppliers[0]?.cost.toNumber() ?? 0;
    // fromUnit * factor = toUnit (ver UnitConversion en el schema) — si
    // standardDoseUnit -> baseUnit tiene un factor, "costo por dosis" =
    // "costo por baseUnit" × ese factor (1 dosis = factor baseUnits).
    const doseFactor = ingredient.standardDoseUnit
      ? conversions.find(
          (c) => c.fromUnit === ingredient.standardDoseUnit && c.toUnit === ingredient.baseUnit
        )?.factor
      : null;
    const unitCost = doseFactor ? costPerBaseUnit * doseFactor.toNumber() : costPerBaseUnit;
    // Mismo criterio que extraPriceDelta en actions/pos.ts (el servidor
    // recalcula el precio real al cobrar; esto es la vista previa).
    const unitPrice =
      ingredient.extraUnitPrice?.toNumber() ??
      Math.round((unitCost / (targetFoodCostPercent / 100)) * 100) / 100;

    return {
      id: ingredient.id,
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      unitCost,
      unitPrice,
      standardDoseQuantity: ingredient.standardDoseQuantity?.toNumber() ?? null,
      standardDoseUnit: ingredient.standardDoseUnit,
    };
  });
}

// Turno ABIERTO de la sucursal, si existe. `Sale.shiftId` es obligatorio en
// el schema — el POS no puede vender sin esto.
export async function getOpenShift(branchId: string = DEFAULT_BRANCH_ID) {
  return prisma.shift.findFirst({
    where: { branchId, status: "ABIERTO" },
    orderBy: { openedAt: "desc" },
  });
}

// Productos más vendidos de la sucursal en los últimos `days` días — base
// de la barra de favoritos del POS (accesos con las teclas 1–8).
export async function getTopSellingProductIds(
  branchId: string = DEFAULT_BRANCH_ID,
  limit = 8,
  days = 30
): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const grouped = await prisma.saleItem.groupBy({
    by: ["productVariantId"],
    where: {
      productVariantId: { not: null },
      sale: { branchId, status: "COMPLETADA", createdAt: { gte: since } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 40,
  });
  const variantIds = grouped.map((g) => g.productVariantId).filter((id): id is string => id !== null);
  if (variantIds.length === 0) return [];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, productId: true },
  });
  const productByVariant = new Map(variants.map((v) => [v.id, v.productId]));
  const seen = new Set<string>();
  const productIds: string[] = [];
  for (const id of variantIds) {
    const productId = productByVariant.get(id);
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    productIds.push(productId);
    if (productIds.length === limit) break;
  }
  return productIds;
}
