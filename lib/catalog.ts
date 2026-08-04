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

export type CatalogVariant = {
  id: string;
  name: string;
  price: number;
  modifierGroups: CatalogModifierGroup[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  variants: CatalogVariant[];
};

export type CatalogCategory = {
  id: string;
  name: string;
  products: CatalogProduct[];
};

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
      products: category.products.map((product) => ({
        id: product.id,
        name: product.name,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: Number(variant.price),
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
        })),
      })),
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
