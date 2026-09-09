import { prisma } from "./prisma";

export type ProductCategoryOption = { id: string; name: string };

export async function getProductCategories(): Promise<ProductCategoryOption[]> {
  const categories = await prisma.productCategory.findMany({ orderBy: { name: "asc" } });
  return categories.map((c) => ({ id: c.id, name: c.name }));
}

export type IngredientOption = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
};

export type ComposedRecipeOption = { id: string; name: string };

export type IngredientPickerOptions = {
  ingredients: IngredientOption[];
  composedRecipes: ComposedRecipeOption[];
};

// Opciones para armar líneas de receta: ingredientes atómicos que se pueden
// referenciar por `ingredientId`, y recetas de ingrediente compuesto
// (jarabes caseros, etc.) que se referencian por `composedRecipeId`. Esta
// pantalla no permite crear recetas compuestas nuevas, solo usar las que ya
// existen.
export async function getIngredientPickerOptions(): Promise<IngredientPickerOptions> {
  const [ingredients, composedRecipes] = await Promise.all([
    prisma.ingredient.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.recipe.findMany({
      where: { kind: "INGREDIENTE_COMPUESTO" },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      baseUnit: i.baseUnit,
    })),
    composedRecipes: composedRecipes.map((r) => ({ id: r.id, name: r.name ?? "(sin nombre)" })),
  };
}

export type RecipeOverviewVariant = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  lineCount: number;
};

export type RecipeOverviewProduct = {
  id: string;
  name: string;
  categoryName: string;
  variants: RecipeOverviewVariant[];
};

// Lista de productos vendibles (kind RECETA es implícito: es lo único que
// esta pantalla crea) con sus variantes y cuántas líneas tiene la receta
// activa de cada una — para la pantalla /recetas.
export async function getRecipeOverview(): Promise<RecipeOverviewProduct[]> {
  const products = await prisma.product.findMany({
    where: { type: "RECETA" },
    orderBy: { name: "asc" },
    include: {
      category: true,
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
    categoryName: product.category.name,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price.toNumber(),
      isActive: variant.isActive,
      lineCount: variant.recipes[0]?.versions[0]?.ingredients.length ?? 0,
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

export type VariantRecipeDetail = {
  variantId: string;
  variantName: string;
  price: number;
  isActive: boolean;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  categoryName: string;
  recipeId: string;
  activeVersionNumber: number;
  lines: RecipeLineDetail[];
};

// Detalle de la receta activa de una variante, para precargar el formulario
// de edición. Lanza si la variante o su receta PRODUCTO_VENDIBLE activa no
// existen — este flujo solo aplica a variantes creadas por esta misma
// pantalla, que siempre las tienen.
export async function getVariantRecipeDetail(
  productVariantId: string
): Promise<VariantRecipeDetail> {
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: productVariantId },
    include: {
      product: { include: { category: true } },
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

  const recipe = variant.recipes[0];
  const version = recipe?.versions[0];
  if (!recipe || !version) {
    throw new Error("Esta variante no tiene una receta activa.");
  }

  return {
    variantId: variant.id,
    variantName: variant.name,
    price: variant.price.toNumber(),
    isActive: variant.isActive,
    productId: variant.product.id,
    productName: variant.product.name,
    productImageUrl: variant.product.imageUrl,
    categoryName: variant.product.category.name,
    recipeId: recipe.id,
    activeVersionNumber: version.versionNumber,
    lines: version.ingredients.map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      composedRecipeId: line.composedRecipeId,
      refName: line.ingredient?.name ?? line.composedRecipe?.name ?? "(desconocido)",
      quantity: line.quantity.toNumber(),
      unit: line.unit,
    })),
  };
}

