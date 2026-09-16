"use server";

import { revalidatePath } from "next/cache";
import { IngredientCategory, Prisma, ProductType, UnitOfMeasure, VariantTemperature } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { recordRecipeCostSnapshot } from "@/lib/recipe-cost";
import { getVariantRecipeDetail } from "@/lib/recipes";

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

  revalidatePath("/productos");

  return {
    id: ingredient.id,
    name: ingredient.name,
    category: ingredient.category,
    baseUnit: ingredient.baseUnit,
    // Un ingrediente recién creado no tiene proveedor cotizado ni dosis
    // estándar todavía.
    costPerUnit: null,
    standardDoseQuantity: null,
    standardDoseUnit: null,
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

// Filas de las secciones "Tipo de leche"/"Extras" del formulario — ver
// applyModifierGroups() más abajo.
export type ModifierOptionInput = {
  ingredientId: string;
  quantity: number;
  priceDelta: number;
};

export type CreateVariantInput = {
  name: string;
  price: number;
  lines: RecipeLineInput[];
  // Solo para bebidas (ProductType.RECETA) — ver puntos 3/4/5/7 de
  // "Módulo Productos".
  temperature?: VariantTemperature;
  sizeOz?: number;
  milkOptions?: ModifierOptionInput[];
  extraOptions?: ModifierOptionInput[];
  // Solo para merch/souvenirs (ProductType.REVENTA_DIRECTA).
  size?: string;
  color?: string;
  note?: string;
};

// Busca en las líneas de receta recién capturadas la que usa un
// ingrediente de categoría LECHE — es la base real de la receta, y se usa
// para generar automáticamente la opción "base" (sin costo) del grupo
// "Tipo de leche", sin que el admin tenga que capturarla a mano.
async function findBaseMilkLine(
  tx: Prisma.TransactionClient,
  lines: RecipeLineInput[]
): Promise<{ ingredientId: string; ingredientName: string; quantity: number } | null> {
  for (const line of lines) {
    if (!line.ingredientId) continue;
    const ingredient = await tx.ingredient.findUnique({ where: { id: line.ingredientId } });
    if (ingredient?.category === "LECHE") {
      return { ingredientId: ingredient.id, ingredientName: ingredient.name, quantity: line.quantity };
    }
  }
  return null;
}

// Crea/actualiza los grupos "Tipo de leche" (sustitución real, isRequired
// false, allowMultiple false — la opción "base" se genera sola desde la
// receta) y "Extras" (adiciones puras, allowMultiple true) — mismo patrón
// ya usado en prisma/seed-lapso.ts, ahora expuesto como server action.
//
// Nota: solo agrega/actualiza opciones (upsert por id determinístico). No
// borra opciones que el admin quite del formulario — un ModifierOption ya
// usado en una venta no se puede borrar (SaleItemModifier.modifierOptionId
// es ON DELETE RESTRICT); quitarlas de verdad requiere Prisma Studio.
async function applyModifierGroups(
  tx: Prisma.TransactionClient,
  variantId: string,
  lines: RecipeLineInput[],
  milkOptions: ModifierOptionInput[],
  extraOptions: ModifierOptionInput[]
) {
  if (milkOptions.length > 0) {
    const groupId = `${variantId}-leche`;
    const group = await tx.variantModifierGroup.upsert({
      where: { id: groupId },
      update: {},
      create: { id: groupId, productVariantId: variantId, name: "Tipo de leche", isRequired: false, allowMultiple: false },
    });

    const baseMilk = await findBaseMilkLine(tx, lines);
    if (baseMilk) {
      await tx.modifierOption.upsert({
        where: { id: `${groupId}-base` },
        update: { name: baseMilk.ingredientName, priceDelta: 0 },
        create: { id: `${groupId}-base`, groupId: group.id, name: baseMilk.ingredientName, priceDelta: 0 },
      });
    }

    for (const opt of milkOptions) {
      if (opt.quantity <= 0) throw new Error("La cantidad de cada opción de leche debe ser mayor a cero.");
      const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: opt.ingredientId } });
      const optionId = `${groupId}-${opt.ingredientId}`;
      await tx.modifierOption.upsert({
        where: { id: optionId },
        update: {
          name: ingredient.name,
          priceDelta: opt.priceDelta,
          ingredientId: opt.ingredientId,
          quantityDelta: opt.quantity,
          unit: ingredient.standardDoseUnit ?? ingredient.baseUnit,
          isSubstitution: true,
        },
        create: {
          id: optionId,
          groupId: group.id,
          name: ingredient.name,
          priceDelta: opt.priceDelta,
          ingredientId: opt.ingredientId,
          quantityDelta: opt.quantity,
          unit: ingredient.standardDoseUnit ?? ingredient.baseUnit,
          isSubstitution: true,
        },
      });
    }
  }

  if (extraOptions.length > 0) {
    const groupId = `${variantId}-extras`;
    const group = await tx.variantModifierGroup.upsert({
      where: { id: groupId },
      update: {},
      create: { id: groupId, productVariantId: variantId, name: "Extras", isRequired: false, allowMultiple: true },
    });

    for (const opt of extraOptions) {
      if (opt.quantity <= 0) throw new Error("La cantidad de cada extra debe ser mayor a cero.");
      const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: opt.ingredientId } });
      const optionId = `${groupId}-${opt.ingredientId}`;
      await tx.modifierOption.upsert({
        where: { id: optionId },
        update: {
          name: ingredient.name,
          priceDelta: opt.priceDelta,
          ingredientId: opt.ingredientId,
          quantityDelta: opt.quantity,
          unit: ingredient.standardDoseUnit ?? ingredient.baseUnit,
          isSubstitution: false,
        },
        create: {
          id: optionId,
          groupId: group.id,
          name: ingredient.name,
          priceDelta: opt.priceDelta,
          ingredientId: opt.ingredientId,
          quantityDelta: opt.quantity,
          unit: ingredient.standardDoseUnit ?? ingredient.baseUnit,
          isSubstitution: false,
        },
      });
    }
  }
}

export type CreateProductWithRecipeInput = {
  employeeId: string;
  productName: string;
  imageUrl?: string;
  categoryId?: string;
  newCategoryName?: string;
  newCategoryIcon?: string;
  // RECETA (bebida con receta, default) o REVENTA_DIRECTA (merch/
  // souvenirs/tarjetas — sin receta, con talla/color/nota en su lugar).
  type?: ProductType;
  variants: CreateVariantInput[];
};

// Alta completa de un producto vendible: Product + BranchProduct (para que
// aparezca de inmediato en el catálogo del POS de la sucursal por defecto,
// ver lib/catalog.ts) + por cada variante su ProductVariant y, si el
// producto es RECETA, su Recipe (PRODUCTO_VENDIBLE) + RecipeVersion v1
// activa + líneas + grupos de modificador opcionales. Si es
// REVENTA_DIRECTA, la variante se crea sin receta, con talla/color/nota.
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

  const type = input.type ?? "RECETA";

  for (const variant of input.variants) {
    if (!variant.name.trim()) {
      throw new Error("Cada variante necesita un nombre.");
    }
    if (variant.price <= 0) {
      throw new Error(`${variant.name}: el precio debe ser mayor a cero.`);
    }
    if (type === "RECETA") {
      validateLines(variant.lines, variant.name);
    }
  }

  const newCategoryName = input.newCategoryName?.trim();
  if (!input.categoryId && !newCategoryName) {
    throw new Error("Elige una categoría o captura el nombre de una nueva.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "PRODUCTO_CREAR");

  const productId = await prisma.$transaction(async (tx) => {
    const category = newCategoryName
      ? await tx.productCategory.create({
          data: { name: newCategoryName, icon: input.newCategoryIcon || null },
        })
      : await tx.productCategory.findUniqueOrThrow({ where: { id: input.categoryId } });

    const product = await tx.product.create({
      data: { name: productName, imageUrl: input.imageUrl?.trim() || null, categoryId: category.id, type },
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
          temperature: variant.temperature ?? null,
          sizeOz: variant.sizeOz ?? null,
          size: variant.size?.trim() || null,
          color: variant.color?.trim() || null,
          note: variant.note?.trim() || null,
        },
      });

      if (type === "RECETA") {
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
        await applyModifierGroups(tx, createdVariant.id, variant.lines, variant.milkOptions ?? [], variant.extraOptions ?? []);
      }
    }

    return product.id;
  });

  revalidatePath("/productos");
  revalidatePath("/pos");

  return { id: productId };
}

export type AddVariantToProductInput = {
  employeeId: string;
  productId: string;
  variant: CreateVariantInput;
};

// Agrega una variante nueva a un producto YA EXISTENTE (punto 2, "Módulo
// Productos") — mismo cuerpo que la parte "por variante" de
// createProductWithRecipe, pero sin crear el producto.
export async function addVariantToProduct(input: AddVariantToProductInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }

  const variant = input.variant;
  if (!variant.name.trim()) {
    throw new Error("La variante necesita un nombre.");
  }
  if (variant.price <= 0) {
    throw new Error("El precio debe ser mayor a cero.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "PRODUCTO_CREAR");

  const variantId = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });

    if (product.type === "RECETA") {
      validateLines(variant.lines, variant.name);
    }

    const createdVariant = await tx.productVariant.create({
      data: {
        productId: product.id,
        name: variant.name.trim(),
        price: variant.price,
        temperature: variant.temperature ?? null,
        sizeOz: variant.sizeOz ?? null,
        size: variant.size?.trim() || null,
        color: variant.color?.trim() || null,
        note: variant.note?.trim() || null,
      },
    });

    if (product.type === "RECETA") {
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
      await recordRecipeCostSnapshot(tx, version.id, "Nueva variante");
      await applyModifierGroups(tx, createdVariant.id, variant.lines, variant.milkOptions ?? [], variant.extraOptions ?? []);
    }

    return createdVariant.id;
  });

  revalidatePath("/productos");
  revalidatePath("/pos");

  return { variantId };
}

export type UpdateVariantRecipeInput = {
  employeeId: string;
  variantId: string;
  name: string;
  price: number;
  isActive: boolean;
  lines: RecipeLineInput[];
  temperature?: VariantTemperature;
  sizeOz?: number;
  milkOptions?: ModifierOptionInput[];
  extraOptions?: ModifierOptionInput[];
  size?: string;
  color?: string;
  note?: string;
  // Nivel producto (no de la variante) — se actualiza vía el producto
  // dueño de esta variante.
  imageUrl?: string;
};

// Editar la receta de una variante existente NO sobreescribe las líneas de
// la versión activa: desactiva esa RecipeVersion (effectiveTo = ahora) y
// crea la siguiente, para preservar el costeo exacto de ventas ya hechas
// contra la versión anterior (ver comentario en RecipeVersion del schema).
// Si el producto es REVENTA_DIRECTA (sin receta), solo actualiza los
// campos de la variante — no hay líneas ni grupos que tocar.
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

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "RECETA_MODIFICAR");

  await prisma.$transaction(async (tx) => {
    const updatedVariant = await tx.productVariant.update({
      where: { id: input.variantId },
      data: {
        name,
        price: input.price,
        isActive: input.isActive,
        temperature: input.temperature ?? null,
        sizeOz: input.sizeOz ?? null,
        size: input.size?.trim() || null,
        color: input.color?.trim() || null,
        note: input.note?.trim() || null,
      },
      include: { product: true },
    });

    if (input.imageUrl !== undefined) {
      await tx.product.update({
        where: { id: updatedVariant.productId },
        data: { imageUrl: input.imageUrl.trim() || null },
      });
    }

    if (updatedVariant.product.type !== "RECETA") {
      // Merch/souvenirs/tarjetas: sin receta que versionar.
      return;
    }

    validateLines(input.lines, name);

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
    await applyModifierGroups(tx, input.variantId, input.lines, input.milkOptions ?? [], input.extraOptions ?? []);
  });

  revalidatePath("/productos");
  revalidatePath("/pos");

  return { variantId: input.variantId };
}

// Envoltura delgada de lib/recipes.ts (lectura pura) como Server Action —
// el workspace de /productos (client) la llama al abrir una variante
// desde el menú de variantes, en vez de precargar el detalle completo
// (recetas, modificadores) de todo el catálogo de una vez.
export async function fetchVariantRecipeDetail(variantId: string) {
  return getVariantRecipeDetail(variantId);
}

export type UpdateProductCategoryInput = {
  employeeId: string;
  categoryId: string;
  name: string;
  icon?: string;
  parentId?: string;
};

// Primera UI real para editar una categoría ya existente (antes solo se
// creaban, vía "+ Nueva categoría" dentro de Nuevo producto) — nombre,
// ícono (components/productos/category-icon-picker.tsx) y categoría
// padre.
export async function updateProductCategory(input: UpdateProductCategoryInput) {
  if (input.employeeId !== (await getSessionEmployeeId())) {
    throw new Error("El empleado no coincide con la sesión activa.");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre de la categoría es obligatorio.");
  }
  if (input.parentId === input.categoryId) {
    throw new Error("Una categoría no puede ser su propia categoría padre.");
  }

  await requirePermission(input.employeeId, DEFAULT_BRANCH_ID, "PRODUCTO_CREAR");

  await prisma.productCategory.update({
    where: { id: input.categoryId },
    data: { name, icon: input.icon || null, parentId: input.parentId || null },
  });

  revalidatePath("/productos");
  revalidatePath("/pos");
}
