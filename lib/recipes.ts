import { Prisma, type ProductType, type VariantTemperature } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";
import { calculateRecipeVersionCost } from "./recipe-cost";

export type ProductCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  parentName: string | null;
};

export type ProductBasicInfo = { id: string; name: string; type: ProductType; categoryName: string };

// Para la pantalla "+ Agregar variante" (punto 2, "Módulo Productos") —
// solo lo necesario para el encabezado, no trae variantes.
export async function getProductBasicInfo(productId: string): Promise<ProductBasicInfo> {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { category: true },
  });
  return { id: product.id, name: product.name, type: product.type, categoryName: product.category.name };
}

export async function getProductCategories(): Promise<ProductCategoryOption[]> {
  const categories = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
    include: { parent: true },
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
  }));
}

// % de costo de alimentos objetivo para el precio sugerido (precio =
// costo ÷ este %), configurable desde Administración (ver
// actions/settings.ts, CONFIGURACION_SISTEMA_GESTIONAR). null en DB
// (sucursal sin ajustar todavía) cae a 30 por defecto.
export async function getTargetFoodCostPercent(): Promise<number> {
  const branch = await prisma.branch.findUnique({ where: { id: DEFAULT_BRANCH_ID } });
  return branch?.targetFoodCostPercent?.toNumber() ?? 30;
}

export type IngredientOption = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  // Costo actual por baseUnit (IngredientSupplier.isSelected), null si
  // nadie lo ha cotizado todavía — mismo criterio que
  // calculateRecipeVersionCost (lib/recipe-cost.ts). Sin conversión de
  // unidad, misma limitación heredada.
  costPerUnit: number | null;
  // Dosis estándar de captura (ver Ingredient.standardDoseQuantity) —
  // RecipeLinesEditor/ModifierOptionsEditor la usan como unidad fija en
  // vez de baseUnit cuando existe.
  standardDoseQuantity: number | null;
  standardDoseUnit: string | null;
};

export type ComposedRecipeOption = { id: string; name: string; currentCost: number };

export type IngredientPickerOptions = {
  ingredients: IngredientOption[];
  composedRecipes: ComposedRecipeOption[];
};

// Opciones para armar líneas de receta: ingredientes atómicos que se pueden
// referenciar por `ingredientId`, y recetas de ingrediente compuesto
// (jarabes caseros, etc.) que se referencian por `composedRecipeId`. Esta
// pantalla no permite crear recetas compuestas nuevas, solo usar las que ya
// existen.
//
// Se excluye la categoría INSUMOS (vasos, tapas, popotes...) — desde
// "Módulo Productos" el vaso ya no se agrega a mano como línea de receta,
// se descuenta automáticamente por ProductVariant.sizeOz (ver
// actions/pos.ts). Si hace falta registrar un vaso/insumo nuevo, sigue
// siendo posible vía "+ Nuevo ingrediente" (create-ingredient-dialog.tsx).
export async function getIngredientPickerOptions(): Promise<IngredientPickerOptions> {
  const [ingredients, composedRecipes] = await Promise.all([
    prisma.ingredient.findMany({
      where: { isActive: true, category: { not: "INSUMOS" } },
      orderBy: { name: "asc" },
      include: { suppliers: { where: { isSelected: true }, take: 1 } },
    }),
    prisma.recipe.findMany({
      where: { kind: "INGREDIENTE_COMPUESTO" },
      orderBy: { name: "asc" },
      include: { versions: { where: { isActive: true }, take: 1 } },
    }),
  ]);

  // Costo de cada receta compuesta (jarabe casero, etc.) en un solo
  // $transaction — calculateRecipeVersionCost (lib/recipe-cost.ts) es
  // recursivo y ya se usa igual en lib/reports.ts.
  const composedCosts = await prisma.$transaction((tx) =>
    Promise.all(
      composedRecipes.map(async (r) => {
        const version = r.versions[0];
        if (!version) return new Prisma.Decimal(0);
        return calculateRecipeVersionCost(tx, version.id);
      })
    )
  );

  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      baseUnit: i.baseUnit,
      costPerUnit: i.suppliers[0]?.cost.toNumber() ?? null,
      standardDoseQuantity: i.standardDoseQuantity?.toNumber() ?? null,
      standardDoseUnit: i.standardDoseUnit,
    })),
    composedRecipes: composedRecipes.map((r, idx) => ({
      id: r.id,
      name: r.name ?? "(sin nombre)",
      currentCost: composedCosts[idx].toNumber(),
    })),
  };
}

export type RecipeOverviewVariant = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  lineCount: number;
  temperature: VariantTemperature | null;
  sizeOz: number | null;
  size: string | null;
  color: string | null;
  note: string | null;
};

export type RecipeOverviewProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  type: ProductType;
  categoryId: string;
  categoryName: string;
  parentCategoryName: string | null;
  variants: RecipeOverviewVariant[];
};

// Lista de todos los productos vendibles (RECETA y REVENTA_DIRECTA — desde
// "Módulo Productos" esta pantalla gestiona ambos, no solo bebidas con
// receta) con sus variantes — para /productos.
export async function getRecipeOverview(): Promise<RecipeOverviewProduct[]> {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      category: { include: { parent: true } },
      variants: {
        orderBy: { name: "asc" },
        include: {
          recipes: {
            where: { kind: "PRODUCTO_VENDIBLE" },
            include: {
              versions: {
                where: { isActive: true },
                take: 1,
                include: { ingredients: true },
              },
            },
          },
        },
      },
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    type: product.type,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    parentCategoryName: product.category.parent?.name ?? null,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price.toNumber(),
      isActive: variant.isActive,
      lineCount: variant.recipes[0]?.versions[0]?.ingredients.length ?? 0,
      temperature: variant.temperature,
      sizeOz: variant.sizeOz?.toNumber() ?? null,
      size: variant.size,
      color: variant.color,
      note: variant.note,
    })),
  }));
}

export type RecipeLineDetail = {
  id: string;
  ingredientId: string | null;
  composedRecipeId: string | null;
  refName: string;
  quantity: number;
  unit: string;
};

export type ModifierOptionDetail = {
  id: string;
  name: string;
  ingredientId: string | null;
  quantity: number | null;
  unit: string | null;
  priceDelta: number;
};

export type VariantRecipeDetail = {
  variantId: string;
  variantName: string;
  price: number;
  isActive: boolean;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  productType: ProductType;
  categoryName: string;
  temperature: VariantTemperature | null;
  sizeOz: number | null;
  size: string | null;
  color: string | null;
  note: string | null;
  // null si el producto es REVENTA_DIRECTA (no tiene receta que editar).
  recipeId: string | null;
  activeVersionNumber: number | null;
  lines: RecipeLineDetail[];
  // Alternativas de "Tipo de leche" ya guardadas (sin la opción "Entera",
  // que es automática) y opciones del grupo "Extras", si existen —
  // precargan las secciones del formulario al editar.
  milkOptions: ModifierOptionDetail[];
  extraOptions: ModifierOptionDetail[];
};

// Detalle de una variante para precargar el formulario de edición. A
// diferencia de antes, NO lanza si no hay receta activa — un producto
// REVENTA_DIRECTA (merch/souvenirs/tarjetas) nunca tiene una, y el
// formulario debe poder editar talla/color/nota igual.
export async function getVariantRecipeDetail(
  productVariantId: string
): Promise<VariantRecipeDetail> {
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: productVariantId },
    include: {
      product: { include: { category: true } },
      modifierGroups: { include: { options: true } },
      recipes: {
        where: { kind: "PRODUCTO_VENDIBLE" },
        include: {
          versions: {
            where: { isActive: true },
            take: 1,
            include: {
              ingredients: {
                include: { ingredient: true, composedRecipe: true },
              },
            },
          },
        },
      },
    },
  });

  const recipe = variant.recipes[0] ?? null;
  const version = recipe?.versions[0] ?? null;

  const milkGroup = variant.modifierGroups.find((g) => g.name === "Tipo de leche");
  const extrasGroup = variant.modifierGroups.find((g) => g.name === "Extras");

  function toOptionDetail(o: { id: string; name: string; ingredientId: string | null; quantityDelta: unknown; unit: string | null; priceDelta: unknown }): ModifierOptionDetail {
    return {
      id: o.id,
      name: o.name,
      ingredientId: o.ingredientId,
      quantity: (o.quantityDelta as { toNumber(): number } | null)?.toNumber() ?? null,
      unit: o.unit,
      priceDelta: (o.priceDelta as { toNumber(): number }).toNumber(),
    };
  }

  return {
    variantId: variant.id,
    variantName: variant.name,
    price: variant.price.toNumber(),
    isActive: variant.isActive,
    productId: variant.product.id,
    productName: variant.product.name,
    productImageUrl: variant.product.imageUrl,
    productType: variant.product.type,
    categoryName: variant.product.category.name,
    temperature: variant.temperature,
    sizeOz: variant.sizeOz?.toNumber() ?? null,
    size: variant.size,
    color: variant.color,
    note: variant.note,
    recipeId: recipe?.id ?? null,
    activeVersionNumber: version?.versionNumber ?? null,
    lines: (version?.ingredients ?? []).map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      composedRecipeId: line.composedRecipeId,
      refName: line.ingredient?.name ?? line.composedRecipe?.name ?? "(desconocido)",
      quantity: line.quantity.toNumber(),
      unit: line.unit,
    })),
    // La opción "Entera" (sin ingredientId, priceDelta 0) es automática —
    // no se precarga como fila editable, solo las alternativas reales.
    milkOptions: (milkGroup?.options ?? [])
      .filter((o) => o.ingredientId)
      .map(toOptionDetail),
    extraOptions: (extrasGroup?.options ?? []).map(toOptionDetail),
  };
}
