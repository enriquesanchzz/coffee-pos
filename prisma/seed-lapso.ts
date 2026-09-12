import { PrismaClient, UnitOfMeasure, ProductType } from "@prisma/client";

const prisma = new PrismaClient();

// Duplicado intencional de lib/constants.ts (ver misma nota en seed-demo.ts).
const DEFAULT_BRANCH_ID = "branch-principal";
const DEFAULT_STOCK_LOCATION_ID = "stock-branch-principal";

// -----------------------------------------------------------------------
// Menú real de LAPSO (Ciudad Guzmán) capturado de fotos del menú físico,
// para trabajar sobre datos reales en vez del catálogo de demo
// (prisma/seed-demo.ts, que sigue existiendo para probar receta/inventario/
// sustitución con datos controlados).
//
// Este script:
//   1. Desactiva TODOS los productos existentes (Product.isActive = false)
//      — no los borra. Es la forma segura de "reemplazar" el catálogo que
//      ve el POS sin arriesgar un error de FK ni borrar ventas históricas
//      (SaleItem.productVariantId/recipeVersionId son ON DELETE SET NULL,
//      pero SaleItemModifier.modifierOptionId es ON DELETE RESTRICT — un
//      borrado real de catálogo con historial de ventas real puede fallar
//      o, peor, forzar a borrar ventas reales. Desactivar es reversible y
//      no toca ninguna fila de venta).
//   2. Siembra ingredientes base (café/leche/vaso/agua/hielo) con los
//      mismos IDs que seed-demo.ts, para que ambos scripts sean
//      compatibles sin importar el orden en que se corran, y actualiza su
//      costo cotizado a precios reales dados por el usuario.
//   3. Siembra el menú real: categorías, productos, variantes y — donde
//      hay una base de costo real (café/leche/esencia) — una receta
//      aproximada, documentada explícitamente como aproximación.
//
// Requiere `prisma/seed.ts` ya corrido (roles/permisos + sucursal + stock
// location). No requiere `prisma/seed-demo.ts`.
// -----------------------------------------------------------------------

// Costo real dado por el usuario:
//   Leche $30/L, Café $300/kg, Esencia $120/L.
// ESPRESSO_SHOT = 18 g (documentado en el enum UnitOfMeasure del schema).
const COSTO_LECHE_POR_ML = 30 / 1000; // 0.03
const COSTO_CAFE_POR_SHOT = (300 / 1000) * 18; // 5.40
const COSTO_ESENCIA_POR_ML = 120 / 1000; // 0.12

// Estos no vienen del usuario — se reusan los mismos valores ya usados en
// seed-demo.ts (documentados ahí como estimaciones), para no introducir un
// segundo costo distinto del mismo ingrediente físico.
const COSTO_AGUA_POR_ML = 0.001;
const COSTO_HIELO_POR_G = 0.002;
const COSTO_VASO_POR_PIEZA = 2.5;

type RecipeLineSpec = {
  ingredientId?: string;
  composedRecipeId?: string;
  quantity: number;
  unit: UnitOfMeasure;
};

// "Chico"/"Mediano"/"Grande" -> índice 0/1/2 para las funciones de receta
// por tamaño de abajo.
type SizeLabel = string;

type VariantSpec = {
  label: SizeLabel;
  price: number;
  recipe?: RecipeLineSpec[];
};

type ProductSpec = {
  id: string;
  name: string;
  categoryId: string;
  type?: ProductType;
  isPerishable?: boolean;
  variants: VariantSpec[];
  // Grupo de sabor sin costo ni consumo de ingrediente propio — el sabor
  // ya está incluido en la "esencia" genérica de la receta base (ver nota
  // en la sección de costos arriba). Se repite igual en cada variante
  // (tamaño) del producto, es obligatorio (el cliente sí debe elegir uno).
  flavorGroup?: { name: string; options: string[] };
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const branch = await prisma.branch.findUnique({ where: { id: DEFAULT_BRANCH_ID } });
  if (!branch) {
    throw new Error(
      "No existe la sucursal por defecto. Corre `npm run prisma:seed` antes de este script."
    );
  }

  console.log("Desactivando catálogo anterior (Product.isActive = false)...");
  await prisma.product.updateMany({ data: { isActive: false } });

  console.log("Sembrando ingredientes base (café, leche, vaso, agua, hielo)...");

  const cafe = await prisma.ingredient.upsert({
    where: { id: "ing-cafe" },
    update: {},
    create: {
      id: "ing-cafe",
      name: "Café en grano",
      category: "CAFE",
      kind: "ATOMICO",
      baseUnit: "ESPRESSO_SHOT",
      purchaseUnit: "KG",
    },
  });

  const leche = await prisma.ingredient.upsert({
    where: { id: "ing-leche" },
    update: {},
    create: {
      id: "ing-leche",
      name: "Leche entera",
      category: "LECHE",
      kind: "ATOMICO",
      baseUnit: "ML",
      purchaseUnit: "L",
    },
  });

  const vaso = await prisma.ingredient.upsert({
    where: { id: "ing-vaso" },
    update: {},
    create: {
      id: "ing-vaso",
      name: "Vaso con tapa desechable",
      category: "INSUMOS",
      kind: "ATOMICO",
      baseUnit: "PIEZA",
      purchaseUnit: "PIEZA",
      tracksExpiration: false,
    },
  });

  const agua = await prisma.ingredient.upsert({
    where: { id: "ing-agua" },
    update: {},
    create: {
      id: "ing-agua",
      name: "Agua",
      category: "JARABES",
      kind: "ATOMICO",
      baseUnit: "ML",
      purchaseUnit: "L",
      tracksExpiration: false,
    },
  });

  const hielo = await prisma.ingredient.upsert({
    where: { id: "ing-hielo" },
    update: {},
    create: {
      id: "ing-hielo",
      name: "Hielo",
      category: "INSUMOS",
      kind: "ATOMICO",
      baseUnit: "G",
      purchaseUnit: "KG",
      tracksExpiration: false,
    },
  });

  console.log("Sembrando esencia de sabor genérica y crema batida...");

  // Una sola "esencia de sabor" genérica cubre chocolate/caramelo/banana/
  // frutas/chai/etc. — el usuario dio un solo costo ($120/L) para
  // "esencia", así que no se modela un SKU distinto por sabor (sería
  // inventar un costo que nadie dio). El inventario de esta esencia no
  // distingue qué sabor específico se usó en cada venta — simplificación
  // documentada, ver docs/CONTINUE.md.
  const esenciaSabor = await prisma.ingredient.upsert({
    where: { id: "ing-esencia-sabor" },
    update: {},
    create: {
      id: "ing-esencia-sabor",
      name: "Esencia de sabor",
      category: "JARABES",
      kind: "ATOMICO",
      baseUnit: "ML",
      purchaseUnit: "L",
    },
  });

  const cremaBatida = await prisma.ingredient.upsert({
    where: { id: "ing-crema-batida" },
    update: {},
    create: {
      id: "ing-crema-batida",
      name: "Crema batida",
      category: "TOPPINGS",
      kind: "ATOMICO",
      baseUnit: "PIEZA",
      purchaseUnit: "PIEZA",
      tracksExpiration: false,
    },
  });

  console.log("Sembrando ingredientes de la sección Extras del menú...");

  // Los "Extras" del menú (Aderezo, Salsa, Extracción, etc.) son cargos
  // fijos al cliente, no un costo mayorista — para que "agregar otro
  // ingrediente" en el POS (ver actions/pos.ts, AGREGAR_EXTRA) cobre
  // exactamente el precio del menú al agregar 1 pieza, el costo cotizado
  // de estos ingredientes se fija IGUAL al precio de venta del extra, no a
  // un costo real de insumo — simplificación explícita, documentada en
  // docs/CONTINUE.md, porque el sistema no modela un margen aparte para
  // extras libres.
  const extrasMenu: { id: string; name: string; category: "INSUMOS" | "LECHE" | "TOPPINGS"; cost: number }[] = [
    { id: "ing-extra-aderezo", name: "Aderezo", category: "TOPPINGS", cost: 5 },
    { id: "ing-crema-batida", name: "Crema batida", category: "TOPPINGS", cost: 10 },
    { id: "ing-extra-salsa", name: "Salsa", category: "TOPPINGS", cost: 12 },
    { id: "ing-extra-extraccion", name: "Extracción", category: "INSUMOS", cost: 8 },
    { id: "ing-extra-extraccion-doble", name: "Extracción doble", category: "INSUMOS", cost: 12 },
    { id: "ing-extra-esencia", name: "Esencia (extra)", category: "TOPPINGS", cost: 9 },
    { id: "ing-extra-vaso-leche", name: "Vaso de leche (fría o caliente)", category: "LECHE", cost: 15 },
    { id: "ing-extra-leche-almendras", name: "Leche de almendras", category: "LECHE", cost: 10 },
    { id: "ing-extra-leche-coco", name: "Leche de coco", category: "LECHE", cost: 10 },
  ];

  const extraIngredients = new Map<string, { id: string; cost: number }>();
  for (const extra of extrasMenu) {
    const ingredient = await prisma.ingredient.upsert({
      where: { id: extra.id },
      update: {},
      create: {
        id: extra.id,
        name: extra.name,
        category: extra.category,
        kind: "ATOMICO",
        baseUnit: "PIEZA",
        purchaseUnit: "PIEZA",
        tracksExpiration: false,
      },
    });
    extraIngredients.set(extra.id, { id: ingredient.id, cost: extra.cost });
  }

  console.log("Sembrando proveedor base y costos cotizados...");

  const proveedorBase = await prisma.supplier.upsert({
    where: { id: "sup-base" },
    update: {},
    create: { id: "sup-base", name: "Proveedor Central", branchId: null },
  });

  const costos: { ingredientId: string; cost: number }[] = [
    { ingredientId: cafe.id, cost: COSTO_CAFE_POR_SHOT },
    { ingredientId: leche.id, cost: COSTO_LECHE_POR_ML },
    { ingredientId: vaso.id, cost: COSTO_VASO_POR_PIEZA },
    { ingredientId: agua.id, cost: COSTO_AGUA_POR_ML },
    { ingredientId: hielo.id, cost: COSTO_HIELO_POR_G },
    { ingredientId: esenciaSabor.id, cost: COSTO_ESENCIA_POR_ML },
    ...Array.from(extraIngredients.values()).map((e) => ({ ingredientId: e.id, cost: e.cost })),
  ];

  for (const item of costos) {
    const ingredient = await prisma.ingredient.findUniqueOrThrow({ where: { id: item.ingredientId } });
    await prisma.ingredientSupplier.upsert({
      where: { ingredientId_supplierId: { ingredientId: item.ingredientId, supplierId: proveedorBase.id } },
      update: { cost: item.cost, costUnit: ingredient.baseUnit, isSelected: true },
      create: {
        ingredientId: item.ingredientId,
        supplierId: proveedorBase.id,
        cost: item.cost,
        costUnit: ingredient.baseUnit,
        isSelected: true,
      },
    });
  }

  console.log("Sembrando stock inicial (solo si no existía)...");

  const initialStock: { ingredientId: string; quantity: number }[] = [
    { ingredientId: cafe.id, quantity: 1000 },
    { ingredientId: leche.id, quantity: 40000 },
    { ingredientId: vaso.id, quantity: 1000 },
    { ingredientId: agua.id, quantity: 20000 },
    { ingredientId: hielo.id, quantity: 30000 },
    { ingredientId: esenciaSabor.id, quantity: 20000 },
    ...Array.from(extraIngredients.values()).map((e) => ({ ingredientId: e.id, quantity: 500 })),
  ];

  for (const stock of initialStock) {
    await prisma.inventoryStock.upsert({
      where: {
        ingredientId_stockLocationId: { ingredientId: stock.ingredientId, stockLocationId: DEFAULT_STOCK_LOCATION_ID },
      },
      // No se sobreescribe si ya existe — no queremos resetear un
      // inventario que ya se usó de verdad en una venta anterior.
      update: {},
      create: { ingredientId: stock.ingredientId, stockLocationId: DEFAULT_STOCK_LOCATION_ID, quantity: stock.quantity },
    });
  }

  console.log("Sembrando categorías y menú real de LAPSO...");

  async function category(name: string): Promise<string> {
    const cat = await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    return cat.id;
  }

  const catChocolates = await category("Chocolates");
  const catTe = await category("Té e Infusiones");
  const catTisanas = await category("Tisanas");
  const catSmoothie = await category("Smoothie");
  const catChai = await category("Chai");
  const catMalteada = await category("Malteada");
  const catSoda = await category("Soda Italiana");
  const catCafe = await category("Café");
  const catEspresso = await category("Espresso");
  const catCapuccinos = await category("Capuccinos");
  const catLatte = await category("Latte");
  const catBocadillos = await category("Bocadillos");
  const catGalletas = await category("Galletas");
  const catPasteles = await category("Pasteles");
  const catPiesTartas = await category("Pies y Tartas");
  const catMacarons = await category("Macarons");
  const catSouvenirs = await category("Souvenirs");
  const catTarjetaRegalo = await category("Tarjeta de regalo");
  const catCafeGrano = await category("Café en grano");

  // -----------------------------------------------------------------------
  // Recetas por familia de bebida — fórmulas aproximadas, mismo criterio en
  // toda la categoría (no una por producto), documentadas aquí en vez de
  // repetidas como comentario en cada línea. Todas incluyen 1 vaso.
  // Escalado por tamaño: índice 0 = Chico, 1 = Mediano, 2 = Grande.
  // -----------------------------------------------------------------------

  function base(...lines: RecipeLineSpec[]): RecipeLineSpec[] {
    return [...lines, { ingredientId: vaso.id, quantity: 1, unit: "PIEZA" }];
  }

  // Café/agua, sin leche — Americano y similares.
  function recetaAmericano(i: number, shots: number[], aguaMl: number[], hieloG?: number[]): RecipeLineSpec[] {
    const lines: RecipeLineSpec[] = [
      { ingredientId: cafe.id, quantity: shots[i], unit: "ESPRESSO_SHOT" },
      { ingredientId: agua.id, quantity: aguaMl[i], unit: "ML" },
    ];
    if (hieloG) lines.push({ ingredientId: hielo.id, quantity: hieloG[i], unit: "G" });
    return base(...lines);
  }

  // Café + leche (+ esencia opcional) — Capuccino/Latte.
  function recetaCafeConLeche(
    i: number,
    shots: number[],
    lecheMl: number[],
    esenciaMl?: number[],
    hieloG?: number[]
  ): RecipeLineSpec[] {
    const lines: RecipeLineSpec[] = [
      { ingredientId: cafe.id, quantity: shots[i], unit: "ESPRESSO_SHOT" },
      { ingredientId: leche.id, quantity: lecheMl[i], unit: "ML" },
    ];
    if (esenciaMl && esenciaMl[i] > 0) {
      lines.push({ ingredientId: esenciaSabor.id, quantity: esenciaMl[i], unit: "ML" });
    }
    if (hieloG) lines.push({ ingredientId: hielo.id, quantity: hieloG[i], unit: "G" });
    return base(...lines);
  }

  // Leche + esencia, sin café — Chocolates/Chai/Malteada/Smoothie.
  function recetaLecheEsencia(
    i: number,
    lecheMl: number[],
    esenciaMl: number[],
    hieloG?: number[]
  ): RecipeLineSpec[] {
    const lines: RecipeLineSpec[] = [
      { ingredientId: leche.id, quantity: lecheMl[i], unit: "ML" },
      { ingredientId: esenciaSabor.id, quantity: esenciaMl[i], unit: "ML" },
    ];
    if (hieloG) lines.push({ ingredientId: hielo.id, quantity: hieloG[i], unit: "G" });
    return base(...lines);
  }

  // Agua + esencia, sin leche ni café — Soda italiana, Chocolate en agua.
  function recetaAguaEsencia(
    i: number,
    aguaMl: number[],
    esenciaMl: number[],
    hieloG?: number[]
  ): RecipeLineSpec[] {
    const lines: RecipeLineSpec[] = [
      { ingredientId: agua.id, quantity: aguaMl[i], unit: "ML" },
      { ingredientId: esenciaSabor.id, quantity: esenciaMl[i], unit: "ML" },
    ];
    if (hieloG) lines.push({ ingredientId: hielo.id, quantity: hieloG[i], unit: "G" });
    return base(...lines);
  }

  async function seedProduct(spec: ProductSpec) {
    const product = await prisma.product.upsert({
      where: { id: spec.id },
      update: { name: spec.name, categoryId: spec.categoryId, isActive: true, type: spec.type ?? "RECETA", isPerishable: spec.isPerishable ?? true },
      create: {
        id: spec.id,
        name: spec.name,
        categoryId: spec.categoryId,
        isActive: true,
        type: spec.type ?? "RECETA",
        isPerishable: spec.isPerishable ?? true,
      },
    });

    await prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: branch!.id, productId: product.id } },
      update: { isActive: true },
      create: { branchId: branch!.id, productId: product.id, isActive: true },
    });

    for (const variant of spec.variants) {
      const variantId = `${spec.id}-${slug(variant.label)}`;
      const productVariant = await prisma.productVariant.upsert({
        where: { id: variantId },
        update: { name: variant.label, price: variant.price, isActive: true },
        create: { id: variantId, productId: product.id, name: variant.label, price: variant.price },
      });

      if (variant.recipe) {
        const recipeId = `${variantId}-recipe`;
        const recipe = await prisma.recipe.upsert({
          where: { id: recipeId },
          update: {},
          create: { id: recipeId, kind: "PRODUCTO_VENDIBLE", productVariantId: productVariant.id },
        });

        const version = await prisma.recipeVersion.upsert({
          where: { recipeId_versionNumber: { recipeId: recipe.id, versionNumber: 1 } },
          update: {},
          create: { id: `${recipeId}-v1`, recipeId: recipe.id, versionNumber: 1, isActive: true },
        });

        await prisma.recipeIngredient.deleteMany({ where: { recipeVersionId: version.id } });
        await prisma.recipeIngredient.createMany({
          data: variant.recipe.map((line) => ({
            recipeVersionId: version.id,
            ingredientId: line.ingredientId,
            composedRecipeId: line.composedRecipeId,
            quantity: line.quantity,
            unit: line.unit,
          })),
        });
      }

      if (spec.flavorGroup) {
        const groupId = `${variantId}-flavor`;
        const group = await prisma.variantModifierGroup.upsert({
          where: { id: groupId },
          update: {},
          create: {
            id: groupId,
            productVariantId: productVariant.id,
            name: spec.flavorGroup.name,
            isRequired: true,
            allowMultiple: false,
          },
        });

        for (const optionName of spec.flavorGroup.options) {
          await prisma.modifierOption.upsert({
            where: { id: `${groupId}-${slug(optionName)}` },
            update: {},
            create: {
              id: `${groupId}-${slug(optionName)}`,
              groupId: group.id,
              name: optionName,
              priceDelta: 0,
            },
          });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // CAFÉ
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-americano",
    name: "Americano",
    categoryId: catCafe,
    variants: [
      { label: "Chico", price: 27, recipe: recetaAmericano(0, [1, 1, 2], [150, 200, 250]) },
      { label: "Mediano", price: 34, recipe: recetaAmericano(1, [1, 1, 2], [150, 200, 250]) },
      { label: "Grande", price: 37, recipe: recetaAmericano(2, [1, 1, 2], [150, 200, 250]) },
    ],
  });
  await seedProduct({
    id: "lapso-americano-frio",
    name: "Americano Frío",
    categoryId: catCafe,
    variants: [
      { label: "Chico", price: 28, recipe: recetaAmericano(0, [1, 1, 2], [100, 130, 160], [100, 130, 160]) },
      { label: "Mediano", price: 35, recipe: recetaAmericano(1, [1, 1, 2], [100, 130, 160], [100, 130, 160]) },
      { label: "Grande", price: 39, recipe: recetaAmericano(2, [1, 1, 2], [100, 130, 160], [100, 130, 160]) },
    ],
  });
  await seedProduct({
    id: "lapso-prensa-francesa",
    name: "Prensa Francesa",
    categoryId: catCafe,
    variants: [
      { label: "Único", price: 55, recipe: base({ ingredientId: cafe.id, quantity: 3, unit: "ESPRESSO_SHOT" }, { ingredientId: agua.id, quantity: 300, unit: "ML" }) },
    ],
  });

  // -----------------------------------------------------------------------
  // ESPRESSO
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-espresso-americano",
    name: "Espresso Americano",
    categoryId: catEspresso,
    variants: [
      { label: "Chico", price: 36, recipe: recetaAmericano(0, [1, 1, 2], [100, 130, 160]) },
      { label: "Mediano", price: 45, recipe: recetaAmericano(1, [1, 1, 2], [100, 130, 160]) },
      { label: "Grande", price: 50, recipe: recetaAmericano(2, [1, 1, 2], [100, 130, 160]) },
    ],
  });
  await seedProduct({
    id: "lapso-espresso",
    name: "Espresso",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 26, recipe: base({ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }) },
      { label: "Doble", price: 31, recipe: base({ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }) },
    ],
  });
  await seedProduct({
    id: "lapso-cortado",
    name: "Cortado",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 32, recipe: base({ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 20, unit: "ML" }) },
      { label: "Doble", price: 37, recipe: base({ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 30, unit: "ML" }) },
    ],
  });
  await seedProduct({
    id: "lapso-macciato",
    name: "Macciato",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 32, recipe: base({ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 10, unit: "ML" }) },
      { label: "Doble", price: 37, recipe: base({ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 15, unit: "ML" }) },
    ],
  });
  await seedProduct({
    id: "lapso-con-panna",
    name: "Con Panna",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 36, recipe: base({ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }, { ingredientId: cremaBatida.id, quantity: 1, unit: "PIEZA" }) },
      { label: "Doble", price: 41, recipe: base({ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }, { ingredientId: cremaBatida.id, quantity: 1, unit: "PIEZA" }) },
    ],
  });

  // -----------------------------------------------------------------------
  // CAPUCCINOS
  // -----------------------------------------------------------------------
  const capuccinos: { id: string; name: string; price: [number, number, number]; esencia?: [number, number, number] }[] = [
    { id: "lapso-capuccino-clasico", name: "Capuccino Clásico", price: [43, 49, 54] },
    { id: "lapso-capuccino-moca", name: "Capuccino Moca", price: [46, 53, 58], esencia: [5, 7, 10] },
    { id: "lapso-capuccino-moca-blanco", name: "Capuccino Moca Blanco", price: [46, 53, 58], esencia: [5, 7, 10] },
    { id: "lapso-capuccino-caramelo", name: "Capuccino Caramelo", price: [47, 54, 59], esencia: [5, 7, 10] },
  ];
  for (const c of capuccinos) {
    await seedProduct({
      id: c.id,
      name: c.name,
      categoryId: catCapuccinos,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
        label,
        price: c.price[i],
        recipe: recetaCafeConLeche(i, [1, 1, 2], [150, 200, 250], c.esencia),
      })),
    });
  }

  // -----------------------------------------------------------------------
  // LATTE
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-latte-caliente",
    name: "Latte Caliente",
    categoryId: catLatte,
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [43, 49, 54][i],
      recipe: recetaCafeConLeche(i, [1, 1, 2], [180, 220, 260]),
    })),
  });
  await seedProduct({
    id: "lapso-latte-frio",
    name: "Latte Frío",
    categoryId: catLatte,
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [45, 52, 57][i],
      recipe: recetaCafeConLeche(i, [1, 1, 2], [150, 190, 220], undefined, [100, 130, 160]),
    })),
  });
  await seedProduct({
    id: "lapso-latte-banana",
    name: "Latte Banana",
    categoryId: catLatte,
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [52, 60, 66][i],
      recipe: recetaCafeConLeche(i, [1, 1, 2], [180, 220, 260], [5, 7, 10]),
    })),
  });

  // -----------------------------------------------------------------------
  // CHOCOLATES
  // -----------------------------------------------------------------------
  const chocolates: { id: string; name: string; price: [number, number, number]; agua?: boolean; esencia: [number, number, number] }[] = [
    { id: "lapso-chocolate-frio", name: "Chocolate Frío", price: [42, 48, 53], esencia: [8, 10, 12] },
    { id: "lapso-chocolate-tradicional", name: "Chocolate Tradicional", price: [42, 48, 53], esencia: [8, 10, 12] },
    { id: "lapso-chocolate-tradicional-agua", name: "Tradicional en Agua", price: [40, 46, 51], agua: true, esencia: [8, 10, 12] },
    { id: "lapso-chocolate-extra-amargo", name: "Chocolate Extra Amargo", price: [45, 52, 57], esencia: [10, 12, 14] },
    { id: "lapso-chocolate-espanol", name: "Chocolate Español", price: [45, 52, 57], esencia: [10, 12, 14] },
    { id: "lapso-chocolate-lapso", name: "Chocolate LAPSO", price: [54, 62, 68], esencia: [12, 15, 18] },
    { id: "lapso-chocomenta-caliente", name: "Chocomenta Caliente", price: [52, 60, 66], esencia: [10, 12, 14] },
    { id: "lapso-carturo", name: "Carturo", price: [45, 52, 57], esencia: [10, 12, 14] },
  ];
  for (const c of chocolates) {
    await seedProduct({
      id: c.id,
      name: c.name,
      categoryId: catChocolates,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
        label,
        price: c.price[i],
        recipe: c.agua
          ? recetaAguaEsencia(i, [200, 250, 300], c.esencia)
          : recetaLecheEsencia(i, [180, 220, 260], c.esencia),
      })),
    });
  }

  // -----------------------------------------------------------------------
  // TÉ E INFUSIONES / TISANAS — sin receta: no hay costo de té/hierbas dado.
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-te",
    name: "Té",
    categoryId: catTe,
    variants: [
      { label: "Chico", price: 37 },
      { label: "Mediano", price: 41 },
      { label: "Grande", price: 45 },
    ],
    flavorGroup: { name: "Temperatura", options: ["Caliente", "Frío"] },
  });

  const tisanas: { id: string; name: string; price: [number, number, number] }[] = [
    { id: "lapso-tisana-caliente", name: "Tisana Caliente", price: [37, 41, 45] },
    { id: "lapso-tisana-fria", name: "Tisana Fría", price: [39, 43, 47] },
    { id: "lapso-tisana-cristal", name: "Tisana Cristal", price: [47, 54, 59] },
    { id: "lapso-tisana-yogurt", name: "Tisana Yogurt", price: [47, 54, 59] },
    { id: "lapso-tisana-frappe", name: "Tisana Frappé", price: [52, 60, 66] },
  ];
  for (const t of tisanas) {
    await seedProduct({
      id: t.id,
      name: t.name,
      categoryId: catTisanas,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({ label, price: t.price[i] })),
    });
  }

  // -----------------------------------------------------------------------
  // SMOOTHIE
  // -----------------------------------------------------------------------
  const smoothies = ["Chamoy", "Mango Maracuyá", "Tamarindo"];
  for (const flavor of smoothies) {
    await seedProduct({
      id: `lapso-smoothie-${slug(flavor)}`,
      name: `Smoothie ${flavor}`,
      categoryId: catSmoothie,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
        label,
        price: [43, 48, 53][i],
        recipe: recetaLecheEsencia(i, [150, 180, 210], [10, 13, 16], [80, 100, 120]),
      })),
    });
  }

  // -----------------------------------------------------------------------
  // CHAI / DIRTY CHAI — sabor (Tradicional/Té Verde/Manzana) no cambia el
  // precio en el menú real, así que se modela como grupo de sabor
  // obligatorio sin costo, no como productos separados.
  // -----------------------------------------------------------------------
  const saborChai = { name: "Sabor", options: ["Tradicional", "Té Verde", "Manzana"] };
  const chaiVariantes: { id: string; name: string; price: [number, number, number]; hielo?: [number, number, number]; dirty?: boolean }[] = [
    { id: "lapso-chai-frio", name: "Chai Frío", price: [48, 55, 61], hielo: [80, 100, 120] },
    { id: "lapso-chai-caliente", name: "Chai Caliente", price: [47, 54, 59] },
    { id: "lapso-chai-frappe", name: "Chai Frappé", price: [56, 63, 69], hielo: [100, 130, 160] },
    { id: "lapso-dirty-chai-frio", name: "Dirty Chai Frío", price: [52, 58, 64], hielo: [80, 100, 120], dirty: true },
    { id: "lapso-dirty-chai-caliente", name: "Dirty Chai Caliente", price: [51, 57, 63], dirty: true },
    { id: "lapso-dirty-chai-frappe", name: "Dirty Chai Frappé", price: [59, 66, 73], hielo: [100, 130, 160], dirty: true },
  ];
  for (const c of chaiVariantes) {
    await seedProduct({
      id: c.id,
      name: c.name,
      categoryId: catChai,
      flavorGroup: saborChai,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => {
        const lines = recetaLecheEsencia(i, [150, 200, 250], [6, 8, 10], c.hielo);
        if (c.dirty) {
          // "Dirty" = un shot de espresso agregado a la base de chai —
          // constante, no escala con el tamaño (mismo criterio que un
          // "shot extra" de café en cualquier otra bebida).
          lines.unshift({ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" });
        }
        return { label, price: c.price[i], recipe: lines };
      }),
    });
  }

  // -----------------------------------------------------------------------
  // MALTEADA — mismo criterio: sabor sin costo, un solo producto.
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-malteada",
    name: "Malteada",
    categoryId: catMalteada,
    flavorGroup: { name: "Sabor", options: ["Chocolate", "Vainilla", "Fresa"] },
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [43, 49, 54][i],
      recipe: recetaLecheEsencia(i, [180, 220, 260], [8, 10, 12], [60, 80, 100]),
    })),
  });

  // -----------------------------------------------------------------------
  // SODA ITALIANA — mismo criterio, muchas más opciones de sabor.
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-soda-italiana",
    name: "Soda Italiana",
    categoryId: catSoda,
    flavorGroup: {
      name: "Sabor",
      options: [
        "Manzana Verde",
        "Mango",
        "Fresa",
        "Granada",
        "Arándano",
        "Frambuesa",
        "Durazno",
        "Mandarina",
        "Blue Curaçao",
        "Melón",
        "Açaí",
      ],
    },
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [41, 46, 50][i],
      recipe: recetaAguaEsencia(i, [150, 180, 210], [15, 20, 25], [100, 130, 160]),
    })),
  });

  // -----------------------------------------------------------------------
  // BOCADILLOS, POSTRES, SOUVENIRS, TARJETA DE REGALO, CAFÉ EN GRANO
  // — reventa directa: precio único, sin receta (no pasan por el modelo de
  // consumo por ingrediente, ver ProductType.REVENTA_DIRECTA en el schema).
  // -----------------------------------------------------------------------
  const bocadillos: { id: string; name: string; price: number }[] = [
    { id: "lapso-croissant", name: "Croissant (Jamón o Vegetariano)", price: 45 },
    { id: "lapso-bagel-jamon-pavo", name: "Bagel (Jamón Serrano o de Pavo)", price: 66 },
    { id: "lapso-bagel-chipotle-queso", name: "Bagel Chipotle y Queso", price: 68 },
    { id: "lapso-bagel-queso-mermelada", name: "Bagel con Queso Crema y Mermelada", price: 40 },
    { id: "lapso-ciabatta", name: "Ciabatta LAPSO", price: 68 },
    { id: "lapso-ensalada-espinacas", name: "Ensalada de Espinacas", price: 49 },
    { id: "lapso-pizza-pita", name: "Pizza Pita (individual)", price: 57 },
  ];
  for (const b of bocadillos) {
    await seedProduct({
      id: b.id,
      name: b.name,
      categoryId: catBocadillos,
      type: "REVENTA_DIRECTA",
      isPerishable: true,
      variants: [{ label: "Único", price: b.price }],
    });
  }

  const galletas: { id: string; name: string; price: number }[] = [
    { id: "lapso-galletas-avena-arandanos", name: "Galletas de Avena y Arándanos", price: 28 },
    { id: "lapso-galletas-chispas", name: "Galletas de Chispas", price: 28 },
    { id: "lapso-galletas-nuez", name: "Galletas de Nuez", price: 33 },
    { id: "lapso-tejas-almendras", name: "Tejas de Almendras", price: 34 },
  ];
  for (const g of galletas) {
    await seedProduct({
      id: g.id,
      name: g.name,
      categoryId: catGalletas,
      type: "REVENTA_DIRECTA",
      isPerishable: true,
      variants: [{ label: "Único", price: g.price }],
    });
  }

  const pasteles: { id: string; name: string; price: number }[] = [
    { id: "lapso-pastel-chocolate", name: "Pastel de Chocolate", price: 72 },
    { id: "lapso-pastel-tres-leches", name: "Pastel de Tres Leches", price: 72 },
    { id: "lapso-pastel-red-velvet", name: "Pastel Red Velvet", price: 72 },
    { id: "lapso-pastel-zanahoria", name: "Pastel de Zanahoria", price: 72 },
    { id: "lapso-mousse-tres-chocolates", name: "Mousse de Tres Chocolates", price: 45 },
    { id: "lapso-tiramisu", name: "Tiramisú", price: 72 },
  ];
  for (const p of pasteles) {
    await seedProduct({
      id: p.id,
      name: p.name,
      categoryId: catPasteles,
      type: "REVENTA_DIRECTA",
      isPerishable: true,
      variants: [{ label: "Único", price: p.price }],
    });
  }

  const piesTartas: { id: string; name: string; price: number }[] = [
    { id: "lapso-pie-limon", name: "Pie de Limón", price: 43 },
    { id: "lapso-tarta-chocolate-oro", name: "Tarta de Chocolate y Oro", price: 43 },
    { id: "lapso-tarta-manzana", name: "Tarta de Manzana", price: 75 },
    { id: "lapso-cheesecake-frutos-rojos", name: "Cheesecake Frutos Rojos", price: 39 },
    { id: "lapso-cheesecake-dulce-leche", name: "Cheesecake Dulce de Leche", price: 39 },
  ];
  for (const p of piesTartas) {
    await seedProduct({
      id: p.id,
      name: p.name,
      categoryId: catPiesTartas,
      type: "REVENTA_DIRECTA",
      isPerishable: true,
      variants: [{ label: "Único", price: p.price }],
    });
  }

  await seedProduct({
    id: "lapso-macaron-individual",
    name: "Macaron Individual",
    categoryId: catMacarons,
    type: "REVENTA_DIRECTA",
    isPerishable: true,
    variants: [{ label: "Único", price: 18 }],
  });
  await seedProduct({
    id: "lapso-macarons-caja-5",
    name: "Macarons Caja con Cinco Piezas",
    categoryId: catMacarons,
    type: "REVENTA_DIRECTA",
    isPerishable: true,
    variants: [{ label: "Único", price: 83 }],
  });

  await seedProduct({
    id: "lapso-vaso-souvenir",
    name: "Vaso LAPSO",
    categoryId: catSouvenirs,
    type: "REVENTA_DIRECTA",
    isPerishable: false,
    variants: [{ label: "Único", price: 45 }],
  });
  await seedProduct({
    id: "lapso-refill-americano",
    name: "Refill Americano (Vaso LAPSO)",
    categoryId: catSouvenirs,
    type: "REVENTA_DIRECTA",
    isPerishable: false,
    variants: [{ label: "Único", price: 20 }],
  });

  await seedProduct({
    id: "lapso-tarjeta-regalo",
    name: "Tarjeta de Regalo",
    categoryId: catTarjetaRegalo,
    type: "REVENTA_DIRECTA",
    isPerishable: false,
    variants: [200, 300, 400, 500].map((monto) => ({ label: `$${monto}`, price: monto })),
  });

  await seedProduct({
    id: "lapso-cafe-grano",
    name: "Café en grano (Expendio)",
    categoryId: catCafeGrano,
    type: "REVENTA_DIRECTA",
    isPerishable: true,
    variants: [
      { label: "Bolsa 250 g", price: 80 },
      { label: "Bolsa 500 g", price: 150 },
    ],
  });

  console.log("Menú de LAPSO sembrado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
