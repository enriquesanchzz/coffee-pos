"use server";

import { revalidatePath } from "next/cache";
import { IngredientCategory, UnitOfMeasure } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { recordRecipeCostSnapshot } from "@/lib/recipe-cost";

export type CreateIngredientInput = {
  employeeId: string;
  name: string;
  category: IngredientCategory;
  baseUnit: UnitOfMeasure;
  purchaseUnit: UnitOfMeasure;
};

export async function createIngredient(input: CreateIngredientInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del ingrediente es obligatorio.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "INVENTARIO_CREAR_ITEM");

  const ingredient = await prisma.ingredient.create({
    data: {
      name,
      category: input.category,
      baseUnit: input.baseUnit,
      purchaseUnit: input.purchaseUnit,
    },
  });

  revalidatePath("/recetas");

  return {
    id: ingredient.id,
    name: ingredient.name,
    category: ingredient.category,
    baseUnit: ingredient.baseUnit,
  };
}

export type RecipeLineInput = {
  ingredientId?: string;
  composedRecipeId?: string;
  quantity: number;
  unit: UnitOfMeasure;
};

function validateLines(lines: RecipeLineInput[], variantLabel: string) {
  if (lines.length === 0) {
    throw new Error(`${variantLabel}: agrega al menos un ingrediente a la receta.`);
  }

  const seenRefs = new Set<string>();
  for (const line of lines) {
    const hasIngredient = Boolean(line.ingredientId);
    const hasComposed = Boolean(line.composedRecipeId);
    if (hasIngredient === hasComposed) {
      throw new Error(
        `${variantLabel}: cada línea debe tener exactamente un ingrediente o ingrediente compuesto.`
      );
    }
    if (line.quantity <= 0) {
      throw new Error(`${variantLabel}: la cantidad de cada línea debe ser mayor a cero.`);
    }

    const ref = line.ingredientId ?? line.composedRecipeId!;
    if (seenRefs.has(ref)) {
      throw new Error(`${variantLabel}: no repitas el mismo ingrediente en dos líneas.`);
    }
    seenRefs.add(ref);
  }
}

export type CreateVariantInput = {
  name: string;
  price: number;
  lines: RecipeLineInput[];
};

export type CreateProductWithRecipeInput = {
  employeeId: string;
  productName: string;
  imageUrl?: string;
  categoryId?: string;
  newCategoryName?: string;
  variants: CreateVariantInput[];
};

// Alta completa de un producto vendible: Product + BranchProduct (para que
// aparezca de inmediato en el catálogo del POS de la sucursal por defecto,
// ver lib/catalog.ts) + por cada variante su ProductVariant + Recipe
// (PRODUCTO_VENDIBLE) + RecipeVersion v1 activa + líneas.
export async function createProductWithRecipe(input: CreateProductWithRecipeInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  const productName = input.productName.trim();
  if (!productName) {
    throw new Error("El nombre del producto es obligatorio.");
  }
  if (input.variants.length === 0) {
    throw new Error("Agrega al menos una variante.");
  }

  for (const variant of input.variants) {
    if (!variant.name.trim()) {
      throw new Error("Cada variante necesita un nombre.");
    }
    if (variant.price <= 0) {
      throw new Error(`${variant.name}: el precio debe ser mayor a cero.`);
    }
    validateLines(variant.lines, variant.name);
  }

  const newCategoryName = input.newCategoryName?.trim();
  if (!input.categoryId && !newCategoryName) {
    throw new Error("Elige una categoría o captura el nombre de una nueva.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "PRODUCTO_CREAR");

  const productId = await prisma.$transaction(async (tx) => {
    const category = newCategoryName
      ? await tx.productCategory.create({ data: { name: newCategoryName } })
      : await tx.productCategory.findUniqueOrThrow({ where: { id: input.categoryId } });

    const product = await tx.product.create({
      data: { name: productName, imageUrl: input.imageUrl?.trim() || null, categoryId: category.id },
    });

    await tx.branchProduct.create({
      data: { branchId: DEFAULT_BRANCH_ID, productId: product.id, isActive: true },
    });

    for (const variant of input.variants) {
      const createdVariant = await tx.productVariant.create({
        data: {
          productId: product.id,
          name: variant.name.trim(),
          price: variant.price,
        },
      });

      const recipe = await tx.recipe.create({
        data: { kind: "PRODUCTO_VENDIBLE", productVariantId: createdVariant.id },
      });

      const version = await tx.recipeVersion.create({
        data: { recipeId: recipe.id, versionNumber: 1, isActive: true },
      });

      await tx.recipeIngredient.createMany({
        data: variant.lines.map((line) => ({
          recipeVersionId: version.id,
          ingredientId: line.ingredientId,
          composedRecipeId: line.composedRecipeId,
          quantity: line.quantity,
          unit: line.unit,
        })),
      });

      await recordRecipeCostSnapshot(tx, version.id, "Alta de producto");
    }

    return product.id;
  });

  revalidatePath("/recetas");
  revalidatePath("/pos");

  return { id: productId };
}

export type UpdateVariantRecipeInput = {
  employeeId: string;
  variantId: string;
  name: string;
  price: number;
  isActive: boolean;
  lines: RecipeLineInput[];
  // Nivel producto (no de la variante) — se actualiza vía el producto
  // dueño de esta variante.
  imageUrl?: string;
};

// Editar la receta de una variante existente NO sobreescribe las líneas de
// la versión activa: desactiva esa RecipeVersion (effectiveTo = ahora) y
// crea la siguiente, para preservar el costeo exacto de ventas ya hechas
// contra la versión anterior (ver comentario en RecipeVersion del schema).
export async function updateVariantRecipe(input: UpdateVariantRecipeInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre de la variante es obligatorio.");
  }
  if (input.price <= 0) {
    throw new Error("El precio debe ser mayor a cero.");
  }
  validateLines(input.lines, name);

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "RECETA_MODIFICAR");

  await prisma.$transaction(async (tx) => {
    const updatedVariant = await tx.productVariant.update({
      where: { id: input.variantId },
      data: { name, price: input.price, isActive: input.isActive },
    });

    if (input.imageUrl !== undefined) {
      await tx.product.update({
        where: { id: updatedVariant.productId },
        data: { imageUrl: input.imageUrl.trim() || null },
      });
    }

    const recipe = await tx.recipe.findFirst({
      where: { productVariantId: input.variantId, kind: "PRODUCTO_VENDIBLE" },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!recipe) {
      throw new Error("Esta variante no tiene una receta — no se puede editar así.");
    }

    const latestVersion = recipe.versions[0];
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    if (latestVersion?.isActive) {
      await tx.recipeVersion.update({
        where: { id: latestVersion.id },
        data: { isActive: false, effectiveTo: new Date() },
      });
    }

    const newVersion = await tx.recipeVersion.create({
      data: { recipeId: recipe.id, versionNumber: nextVersionNumber, isActive: true },
    });

    await tx.recipeIngredient.createMany({
      data: input.lines.map((line) => ({
        recipeVersionId: newVersion.id,
        ingredientId: line.ingredientId,
        composedRecipeId: line.composedRecipeId,
        quantity: line.quantity,
        unit: line.unit,
      })),
    });

    await recordRecipeCostSnapshot(tx, newVersion.id, "Edición de receta");
  });

  revalidatePath("/recetas");
  revalidatePath("/pos");

  return { variantId: input.variantId };
}
