import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";

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

export type VariantTemperature = "CALIENTE" | "FRIO" | "FRAPPE";

export type CatalogVariant = {
  id: string;
  name: string;
  price: number;
  // Ejes derivados del nombre de la variante (ver parseVariantName) — si
  // un producto define variantes "Chico Frío"/"Chico Caliente", el POS
  // puede mostrar dos selectores (tamaño + temperatura) en vez de una
  // lista plana. Si el producto no usa la convención (como hoy, solo
  // "Chico"/"Grande"), temperature queda null y el comportamiento es
  // idéntico al actual.
  sizeLabel: string | null;
  temperature: VariantTemperature | null;
  modifierGroups: CatalogModifierGroup[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  variants: CatalogVariant[];
};

// parentId/parentName: árbol de 2 niveles (ver ProductCategory en el
// schema). Una categoría sin padre (parentId null) es su propio nivel
// superior en la nav — ej. "Café en grano", que no tiene hijas.
export type CatalogCategory = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  products: CatalogProduct[];
};

const TEMPERATURE_SUFFIXES: Record<string, VariantTemperature> = {
  caliente: "CALIENTE",
  frio: "FRIO",
  frío: "FRIO",
  fria: "FRIO",
  fría: "FRIO",
  frappe: "FRAPPE",
  frappé: "FRAPPE",
};

// Convención de nombre de variante: "{Tamaño} {Temperatura}" (ej. "Chico
// Frío"). La palabra final se compara contra CALIENTE/FRÍO — si no
// coincide, el nombre completo se trata como tamaño y no hay eje de
// temperatura (mismo comportamiento que antes de este cambio).
export function parseVariantName(name: string): {
  sizeLabel: string | null;
  temperature: VariantTemperature | null;
} {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1]?.toLowerCase();
  const temperature = lastWord ? (TEMPERATURE_SUFFIXES[lastWord] ?? null) : null;

  if (!temperature) {
    return { sizeLabel: trimmed || null, temperature: null };
  }

  const sizeLabel = words.slice(0, -1).join(" ").trim();
  return { sizeLabel: sizeLabel || null, temperature };
}

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

  return categories
    .filter((category) => category.products.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      parentName: category.parent?.name ?? null,
      products: category.products.map((product) => ({
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        variants: product.variants.map((variant) => {
          const { sizeLabel, temperature } = parseVariantName(variant.name);
          return {
            id: variant.id,
            name: variant.name,
            price: Number(variant.price),
            sizeLabel,
            temperature,
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
  unitCost: number; // costo cotizado en Compras (IngredientSupplier.isSelected), 0 si nadie lo ha cotizado
};

// Para "agregar otro ingrediente" libre en el POS (fuera de los
// ModifierOption curados) — el precio que ve el barista aquí es solo vista
// previa, actions/pos.ts recalcula el precio real con el mismo costo al
// confirmar la venta.
export async function getExtraIngredientOptions(): Promise<ExtraIngredientOption[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { suppliers: { where: { isSelected: true }, take: 1 } },
  });

  return ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    baseUnit: ingredient.baseUnit,
    unitCost: ingredient.suppliers[0]?.cost.toNumber() ?? 0,
  }));
}

// Turno ABIERTO de la sucursal, si existe. `Sale.shiftId` es obligatorio en
// el schema — el POS no puede vender sin esto.
export async function getOpenShift(branchId: string = DEFAULT_BRANCH_ID) {
  return prisma.shift.findFirst({
    where: { branchId, status: "ABIERTO" },
    orderBy: { openedAt: "desc" },
  });
}
