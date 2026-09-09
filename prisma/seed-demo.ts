import { PrismaClient, RoleName } from "@prisma/client";
import { randomBytes, scrypt as scryptCallback } from "crypto";
import { promisify } from "util";

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

// Duplicado intencional de lib/constants.ts: este script corre standalone
// vía ts-node (fuera del runtime de Next.js/tsconfig paths), así que se
// evita depender de la resolución de módulos "@/..." aquí.
const DEFAULT_BRANCH_ID = "branch-principal";
const DEFAULT_STOCK_LOCATION_ID = "stock-branch-principal";

// Duplicado intencional de lib/password.ts (mismo motivo de arriba) — debe
// producir el mismo formato "salt:hash" que lib/session.ts sabe verificar.
async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(plain, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

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

  // Ingredientes para el modificador "Tipo de leche" (sustitución real, ver
  // actions/pos.ts) y para la variante fría (ver más abajo).
  const lecheDeslactosada = await prisma.ingredient.upsert({
    where: { id: "ing-leche-deslactosada" },
    update: {},
    create: {
      id: "ing-leche-deslactosada",
      name: "Leche deslactosada",
      category: "LECHE",
      kind: "ATOMICO",
      baseUnit: "ML",
      purchaseUnit: "L",
    },
  });

  const lecheAvena = await prisma.ingredient.upsert({
    where: { id: "ing-leche-avena" },
    update: {},
    create: {
      id: "ing-leche-avena",
      name: "Leche de avena",
      category: "LECHE",
      kind: "ATOMICO",
      baseUnit: "ML",
      purchaseUnit: "L",
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

  // Latte usa la convención "{Tamaño} {Temperatura}" que lee
  // lib/catalog.ts (parseVariantName) para mostrar los selectores de
  // Tamaño y Temperatura en el POS — con recetas de verdad distintas para
  // frío (menos leche, agrega hielo), no solo una etiqueta cosmética. Ver
  // punto 5 de docs/CONTINUE.md. Capuccino se deja con nombres simples
  // ("Chico"/"Grande") a propósito, para verificar que un producto sin la
  // convención se sigue comportando exactamente igual que antes.
  const variantSpecs: VariantSpec[] = [
    {
      id: "variant-latte-chico",
      productId: latte.id,
      name: "Chico Caliente",
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
      name: "Grande Caliente",
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
      id: "variant-latte-chico-frio",
      productId: latte.id,
      name: "Chico Frío",
      price: 48,
      recipeId: "recipe-latte-chico-frio",
      lines: [
        { ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" },
        { ingredientId: leche.id, quantity: 150, unit: "ML" },
        { ingredientId: hielo.id, quantity: 120, unit: "G" },
        { ingredientId: vaso.id, quantity: 1, unit: "PIEZA" },
        { composedRecipeId: jarabeRecipe.id, quantity: 0.03, unit: "PUMP" },
      ],
    },
    {
      id: "variant-latte-grande-frio",
      productId: latte.id,
      name: "Grande Frío",
      price: 58,
      recipeId: "recipe-latte-grande-frio",
      lines: [
        { ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" },
        { ingredientId: leche.id, quantity: 200, unit: "ML" },
        { ingredientId: hielo.id, quantity: 150, unit: "G" },
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
      update: { name: spec.name, price: spec.price },
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

    // "Tipo de leche" — sustitución real (ver createSale en actions/pos.ts):
    // al elegir una opción se descuenta la leche elegida en vez de la
    // base de la receta, por categoría (LECHE). Solo en variantes que sí
    // llevan leche base.
    const lecheLine = spec.lines.find((line) => line.ingredientId === leche.id);
    if (lecheLine) {
      const milkGroup = await prisma.variantModifierGroup.upsert({
        where: { id: `vmg-${spec.id}-leche` },
        update: {},
        create: {
          id: `vmg-${spec.id}-leche`,
          productVariantId: variant.id,
          name: "Tipo de leche",
          isRequired: false,
          allowMultiple: false,
        },
      });

      const milkOptions = [
        { id: "deslactosada", name: "Deslactosada", ingredientId: lecheDeslactosada.id, priceDelta: 8 },
        { id: "avena", name: "Avena", ingredientId: lecheAvena.id, priceDelta: 12 },
      ];

      for (const option of milkOptions) {
        await prisma.modifierOption.upsert({
          where: { id: `mo-${spec.id}-leche-${option.id}` },
          update: {},
          create: {
            id: `mo-${spec.id}-leche-${option.id}`,
            groupId: milkGroup.id,
            name: option.name,
            priceDelta: option.priceDelta,
            ingredientId: option.ingredientId,
            quantityDelta: lecheLine.quantity,
            unit: lecheLine.unit as never,
            isSubstitution: true,
          },
        });
      }
    }
  }

  console.log("Sembrando empleados de demo...");

  const gerenteRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.GERENTE } });
  const baristaRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.BARISTA } });

  // PIN en texto plano solo en este script (dato de demo) — se guarda
  // hasheado, igual que produciría el flujo real de alta de empleado en
  // Administración. Documentado aquí y en README para quien necesite
  // iniciar sesión con estas cuentas de prueba.
  const anaPinHash = await hashSecret("1234");
  const luisPinHash = await hashSecret("5678");
  // Ana (GERENTE) es la única cuenta de demo con acceso a Administración —
  // tiene EMPLEADO_CREAR/MODIFICAR en la matriz de prisma/seed.ts.
  const anaPasswordHash = await hashSecret("admin1234");

  const ana = await prisma.employee.upsert({
    where: { id: "emp-ana" },
    update: { pin: anaPinHash, email: "ana@nomada.cafe", passwordHash: anaPasswordHash },
    create: {
      id: "emp-ana",
      name: "Ana",
      pin: anaPinHash,
      email: "ana@nomada.cafe",
      passwordHash: anaPasswordHash,
    },
  });

  const luis = await prisma.employee.upsert({
    where: { id: "emp-luis" },
    update: { pin: luisPinHash },
    create: { id: "emp-luis", name: "Luis", pin: luisPinHash },
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
    { ingredientId: lecheDeslactosada.id, quantity: 5000 },
    { ingredientId: lecheAvena.id, quantity: 5000 },
    { ingredientId: hielo.id, quantity: 10000 },
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

  console.log("Sembrando proveedor base y costos cotizados...");

  // Sin esto, cualquier cálculo de costo de receta (lib/recipe-cost.ts) y
  // los reportes de utilidad/recetas mostrarían $0 para todo — un proveedor
  // base con costo por ingrediente da números reales desde el primer momento.
  const proveedorBase = await prisma.supplier.upsert({
    where: { id: "sup-base" },
    update: {},
    create: { id: "sup-base", name: "Proveedor Central", branchId: null },
  });

  // costo cotizado en la baseUnit de cada ingrediente (ver nota en
  // components/compras/supplier-ingredient-costs-editor.tsx sobre por qué
  // costUnit siempre debe coincidir con baseUnit).
  const costosBase: { ingredientId: string; cost: number }[] = [
    { ingredientId: cafe.id, cost: 3.5 }, // por ESPRESSO_SHOT
    { ingredientId: leche.id, cost: 0.02 }, // por ML
    { ingredientId: vaso.id, cost: 2.5 }, // por PIEZA
    { ingredientId: azucar.id, cost: 0.03 }, // por G
    { ingredientId: agua.id, cost: 0.001 }, // por ML
    { ingredientId: esencia.id, cost: 0.8 }, // por ML
    { ingredientId: lecheDeslactosada.id, cost: 0.035 }, // por ML
    { ingredientId: lecheAvena.id, cost: 0.045 }, // por ML
    { ingredientId: hielo.id, cost: 0.002 }, // por G
  ];

  for (const item of costosBase) {
    const ingredient = await prisma.ingredient.findUniqueOrThrow({
      where: { id: item.ingredientId },
    });
    await prisma.ingredientSupplier.upsert({
      where: {
        ingredientId_supplierId: { ingredientId: item.ingredientId, supplierId: proveedorBase.id },
      },
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

  console.log("Sembrando niveles de lealtad...");

  // Sin UI de gestión (ver docs/CONTINUE.md) — igual que los roles, es una
  // decisión de negocio que se siembra, no algo que se edite seguido.
  const nivelesLealtad: { id: string; name: string; minLifetimeStamps: number; benefits?: string }[] = [
    { id: "tier-regular", name: "Regular", minLifetimeStamps: 0 },
    { id: "tier-frecuente", name: "Frecuente", minLifetimeStamps: 10, benefits: "10% de descuento en bebidas frías" },
    { id: "tier-vip", name: "VIP", minLifetimeStamps: 30, benefits: "Bebida de cortesía en tu cumpleaños" },
  ];

  for (const tier of nivelesLealtad) {
    await prisma.loyaltyTier.upsert({
      where: { id: tier.id },
      update: {},
      create: tier,
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
