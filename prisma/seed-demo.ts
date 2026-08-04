import { PrismaClient, RoleName } from "@prisma/client";

const prisma = new PrismaClient();

// Duplicado intencional de lib/constants.ts: este script corre standalone
// vía ts-node (fuera del runtime de Next.js/tsconfig paths), así que se
// evita depender de la resolución de módulos "@/..." aquí.
const DEFAULT_BRANCH_ID = "branch-principal";
const DEFAULT_STOCK_LOCATION_ID = "stock-branch-principal";

// -----------------------------------------------------------------------
// Datos de demo para probar el módulo POS de punta a punta:
//   - Ingredientes (incluye un ingrediente COMPUESTO: jarabe de vainilla
//     casero, para probar la resolución recursiva de receta en createSale).
//   - Latte y Capuccino (Chico/Grande) con receta activa por variante.
//   - Modificador "Shot extra" por variante.
//   - Empleados Ana (PIN 1234, GERENTE) y Luis (PIN 5678, BARISTA).
//   - Un turno abierto en la sucursal principal.
//   - Stock inicial suficiente para vender.
//
// Requiere que `prisma/seed.ts` (roles/permisos + sucursal + ubicaciones de
// stock) ya se haya corrido antes — ver README.md, sección "Puesta en
// marcha". No reemplaza al flujo real de Compras (Fase 2): el stock inicial
// aquí se escribe directo, como si fuera un conteo de apertura.
// -----------------------------------------------------------------------

async function main() {
  const branch = await prisma.branch.findUnique({ where: { id: DEFAULT_BRANCH_ID } });
  if (!branch) {
    throw new Error(
      "No existe la sucursal por defecto. Corre `npm run prisma:seed` antes de este script."
    );
  }

  console.log("Sembrando ingredientes...");

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

  const azucar = await prisma.ingredient.upsert({
    where: { id: "ing-azucar" },
    update: {},
    create: {
      id: "ing-azucar",
      name: "Azúcar",
      category: "JARABES",
      kind: "ATOMICO",
      baseUnit: "G",
      purchaseUnit: "KG",
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

  const esencia = await prisma.ingredient.upsert({
    where: { id: "ing-esencia-vainilla" },
    update: {},
    create: {
      id: "ing-esencia-vainilla",
      name: "Esencia de vainilla",
      category: "JARABES",
      kind: "ATOMICO",
      baseUnit: "ML",
      purchaseUnit: "L",
    },
  });

  console.log("Sembrando jarabe de vainilla casero (ingrediente compuesto)...");

  const jarabeRecipe = await prisma.recipe.upsert({
    where: { id: "recipe-jarabe-vainilla" },
    update: {},
    create: {
      id: "recipe-jarabe-vainilla",
      kind: "INGREDIENTE_COMPUESTO",
      name: "Jarabe de vainilla casero",
    },
  });

  const jarabeVersion = await prisma.recipeVersion.upsert({
    where: { recipeId_versionNumber: { recipeId: jarabeRecipe.id, versionNumber: 1 } },
    update: {},
    create: {
      id: "rv-jarabe-vainilla-v1",
      recipeId: jarabeRecipe.id,
      versionNumber: 1,
      isActive: true,
      notes: "Receta base: 100g azúcar + 100ml agua + 5ml esencia de vainilla.",
    },
  });

  await prisma.recipeIngredient.deleteMany({ where: { recipeVersionId: jarabeVersion.id } });
  await prisma.recipeIngredient.createMany({
    data: [
      { recipeVersionId: jarabeVersion.id, ingredientId: azucar.id, quantity: 100, unit: "G" },
      { recipeVersionId: jarabeVersion.id, ingredientId: agua.id, quantity: 100, unit: "ML" },
      { recipeVersionId: jarabeVersion.id, ingredientId: esencia.id, quantity: 5, unit: "ML" },
    ],
  });

  console.log("Sembrando categoría y productos...");

  const category = await prisma.productCategory.upsert({
    where: { id: "cat-cafe-caliente" },
    update: {},
    create: { id: "cat-cafe-caliente", name: "Café caliente" },
  });

  const latte = await prisma.product.upsert({
    where: { id: "prod-latte" },
    update: {},
    create: { id: "prod-latte", name: "Latte", categoryId: category.id },
  });

  const capuccino = await prisma.product.upsert({
    where: { id: "prod-capuccino" },
    update: {},
    create: { id: "prod-capuccino", name: "Capuccino", categoryId: category.id },
  });

  for (const product of [latte, capuccino]) {
    await prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      update: { isActive: true },
      create: { branchId: branch.id, productId: product.id, isActive: true },
    });
  }

  type VariantSpec = {
    id: string;
    productId: string;
    name: string;
    price: number;
    recipeId: string;
    lines: { ingredientId?: string; composedRecipeId?: string; quantity: number; unit: string }[];
  };

  const variantSpecs: VariantSpec[] = [
    {
      id: "variant-latte-chico",
      productId: latte.id,
      name: "Chico",
      price: 45,
      recipeId: "recipe-latte-chico",
      lines: [
        { ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" },
        { ingredientId: leche.id, quantity: 180, unit: "ML" },
        { ingredientId: vaso.id, quantity: 1, unit: "PIEZA" },
        { composedRecipeId: jarabeRecipe.id, quantity: 0.03, unit: "PUMP" },
      ],
    },
    {
      id: "variant-latte-grande",
      productId: latte.id,
      name: "Grande",
      price: 55,
      recipeId: "recipe-latte-grande",
      lines: [
        { ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" },
        { ingredientId: leche.id, quantity: 240, unit: "ML" },
        { ingredientId: vaso.id, quantity: 1, unit: "PIEZA" },
        { composedRecipeId: jarabeRecipe.id, quantity: 0.05, unit: "PUMP" },
      ],
    },
    {
      id: "variant-capuccino-chico",
      productId: capuccino.id,
      name: "Chico",
      price: 45,
      recipeId: "recipe-capuccino-chico",
      lines: [
        { ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" },
        { ingredientId: leche.id, quantity: 150, unit: "ML" },
        { ingredientId: vaso.id, quantity: 1, unit: "PIEZA" },
      ],
    },
    {
      id: "variant-capuccino-grande",
      productId: capuccino.id,
      name: "Grande",
      price: 55,
      recipeId: "recipe-capuccino-grande",
      lines: [
        { ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" },
        { ingredientId: leche.id, quantity: 200, unit: "ML" },
        { ingredientId: vaso.id, quantity: 1, unit: "PIEZA" },
      ],
    },
  ];

  for (const spec of variantSpecs) {
    const variant = await prisma.productVariant.upsert({
      where: { id: spec.id },
      update: { price: spec.price },
      create: {
        id: spec.id,
        productId: spec.productId,
        name: spec.name,
        price: spec.price,
      },
    });

    const recipe = await prisma.recipe.upsert({
      where: { id: spec.recipeId },
      update: {},
      create: {
        id: spec.recipeId,
        kind: "PRODUCTO_VENDIBLE",
        productVariantId: variant.id,
      },
    });

    const version = await prisma.recipeVersion.upsert({
      where: { recipeId_versionNumber: { recipeId: recipe.id, versionNumber: 1 } },
      update: {},
      create: {
        id: `${spec.recipeId}-v1`,
        recipeId: recipe.id,
        versionNumber: 1,
        isActive: true,
      },
    });

    await prisma.recipeIngredient.deleteMany({ where: { recipeVersionId: version.id } });
    await prisma.recipeIngredient.createMany({
      data: spec.lines.map((line) => ({
        recipeVersionId: version.id,
        ingredientId: line.ingredientId,
        composedRecipeId: line.composedRecipeId,
        quantity: line.quantity,
        unit: line.unit as never,
      })),
    });

    const group = await prisma.variantModifierGroup.upsert({
      where: { id: `vmg-${spec.id}-extras` },
      update: {},
      create: {
        id: `vmg-${spec.id}-extras`,
        productVariantId: variant.id,
        name: "Extras",
        isRequired: false,
        allowMultiple: true,
      },
    });

    await prisma.modifierOption.upsert({
      where: { id: `mo-${spec.id}-shot-extra` },
      update: {},
      create: {
        id: `mo-${spec.id}-shot-extra`,
        groupId: group.id,
        name: "Shot extra",
        priceDelta: 12,
        ingredientId: cafe.id,
        quantityDelta: 1,
        unit: "ESPRESSO_SHOT",
        isSubstitution: false,
      },
    });
  }

  console.log("Sembrando empleados de demo...");

  const gerenteRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.GERENTE } });
  const baristaRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.BARISTA } });

  const ana = await prisma.employee.upsert({
    where: { id: "emp-ana" },
    update: {},
    create: { id: "emp-ana", name: "Ana", pin: "1234" },
  });

  const luis = await prisma.employee.upsert({
    where: { id: "emp-luis" },
    update: {},
    create: { id: "emp-luis", name: "Luis", pin: "5678" },
  });

  await prisma.employeeBranch.upsert({
    where: { employeeId_branchId: { employeeId: ana.id, branchId: branch.id } },
    update: {},
    create: {
      employeeId: ana.id,
      branchId: branch.id,
      roleId: gerenteRole.id,
      isPrimary: true,
      isCashier: true,
    },
  });

  await prisma.employeeBranch.upsert({
    where: { employeeId_branchId: { employeeId: luis.id, branchId: branch.id } },
    update: {},
    create: {
      employeeId: luis.id,
      branchId: branch.id,
      roleId: baristaRole.id,
      isPrimary: true,
      isCashier: true,
    },
  });

  console.log("Sembrando stock inicial...");

  const initialStock: { ingredientId: string; quantity: number }[] = [
    { ingredientId: cafe.id, quantity: 500 },
    { ingredientId: leche.id, quantity: 20000 },
    { ingredientId: vaso.id, quantity: 500 },
    { ingredientId: azucar.id, quantity: 5000 },
    { ingredientId: agua.id, quantity: 5000 },
    { ingredientId: esencia.id, quantity: 500 },
  ];

  for (const stock of initialStock) {
    await prisma.inventoryStock.upsert({
      where: {
        ingredientId_stockLocationId: {
          ingredientId: stock.ingredientId,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        },
      },
      update: { quantity: stock.quantity },
      create: {
        ingredientId: stock.ingredientId,
        stockLocationId: DEFAULT_STOCK_LOCATION_ID,
        quantity: stock.quantity,
      },
    });
  }

  console.log("Verificando turno abierto...");

  const openShift = await prisma.shift.findFirst({
    where: { branchId: branch.id, status: "ABIERTO" },
  });

  if (!openShift) {
    await prisma.shift.create({
      data: {
        branchId: branch.id,
        cashierId: luis.id,
        type: "MATUTINO",
        status: "ABIERTO",
        openingCash: 500,
      },
    });
    console.log("  Turno abierto creado (cajero: Luis).");
  } else {
    console.log("  Ya había un turno abierto, no se creó otro.");
  }

  console.log("Seed de demo completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
