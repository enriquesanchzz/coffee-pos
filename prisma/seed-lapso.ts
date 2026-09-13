import { PrismaClient, UnitOfMeasure, ProductType, VariantTemperature } from "@prisma/client";

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
//   2. Siembra ingredientes base (café/leche/vasos por tamaño/agua/hielo)
//      con los mismos IDs que seed-demo.ts donde aplica, y actualiza su
//      costo cotizado a precios reales dados por el usuario.
//   3. Siembra el árbol de categorías (padre → hijas, ver "Mejoras
//      avanzadas de POS") y el menú real: productos, variantes, recetas
//      aproximadas donde hay costo real. Frío/Caliente/Frappé y el tamaño
//      en onzas viven como campos reales de ProductVariant
//      (`temperature`, `sizeOz` — ver "Módulo Productos" en
//      docs/CONTINUE.md), no como texto en el nombre — el vaso que se
//      descuenta en cada venta se elige automáticamente por `sizeOz`
//      (actions/pos.ts), no como línea de receta manual.
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

// Costo estimado por vaso según capacidad — antes había un solo vaso
// genérico a $2.5/pieza; documentado como estimación, ajustable en
// /compras/proveedores.
const COSTO_VASO_3OZ = 1.5;
const COSTO_VASO_8OZ = 2.0;
const COSTO_VASO_12OZ = 2.5;
const COSTO_VASO_16OZ = 3.0;

// Leches alternativas (punto 5, "Mejoras avanzadas de POS"): el menú real
// las ofrece "sin costo adicional", pero el negocio pidió mostrar su costo
// real y no se dio precio por litro — son ESTIMACIONES documentadas,
// ajustables después en /compras/proveedores sin tocar este script.
const COSTO_LECHE_LIGHT_POR_ML = 32 / 1000;
const COSTO_LECHE_DESLACTOSADA_POR_ML = 38 / 1000;
const COSTO_LECHE_DESLACTOSADA_LIGHT_POR_ML = 40 / 1000;
const COSTO_LECHE_SOYA_POR_ML = 46 / 1000;

// Tamaño real en onzas por etiqueta de tamaño — usado para
// ProductVariant.sizeOz (vaso automático) en toda receta de tamaño
// Chico/Mediano/Grande.
const SIZE_OZ: Record<string, number> = { Chico: 8, Mediano: 12, Grande: 16 };

type RecipeLineSpec = {
  ingredientId?: string;
  composedRecipeId?: string;
  quantity: number;
  unit: UnitOfMeasure;
};

type VariantSpec = {
  label: string; // ej. "Chico", "Sencillo", "Único" — sin sufijo de temperatura
  price: number;
  temperature?: VariantTemperature;
  sizeOz?: number;
  recipe?: RecipeLineSpec[];
  // ml de leche entera que ya usa la receta de esta variante — si se da,
  // seedProduct() agrega el grupo "Tipo de leche" automáticamente (ver
  // milkAlternatives más abajo). No aplica a variantes sin leche.
  milkMl?: number;
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
  // (tamaño/temperatura) del producto, es obligatorio (el cliente sí debe
  // elegir uno).
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

// Id determinístico por variante — incluye la temperatura (cuando la hay)
// porque el label ya no la lleva (antes "Chico Frío", ahora label="Chico"
// + temperature="FRIO"), y dos variantes con el mismo label pero distinta
// temperatura deben tener ids distintos.
function variantId(productId: string, variant: Pick<VariantSpec, "label" | "temperature">): string {
  return `${productId}-${slug(variant.label)}${variant.temperature ? `-${slug(variant.temperature)}` : ""}`;
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

  console.log("Sembrando ingredientes base (café, leche, vasos, agua, hielo)...");

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

  // Vasos por tamaño real (punto 7, "Mejoras avanzadas de POS") — antes
  // era un solo "Vaso con tapa desechable" agregado a mano en cada
  // receta; ahora createSale (actions/pos.ts) elige automáticamente el
  // más chico que alcance según ProductVariant.sizeOz. "ing-vaso" se
  // conserva con ese id (lo usa también prisma/seed-demo.ts) pero pasa a
  // representar el vaso de 12oz.
  const vaso12oz = await prisma.ingredient.upsert({
    where: { id: "ing-vaso" },
    update: { name: "Vaso 12oz", cupCapacityOz: 12 },
    create: {
      id: "ing-vaso",
      name: "Vaso 12oz",
      category: "INSUMOS",
      kind: "ATOMICO",
      baseUnit: "PIEZA",
      purchaseUnit: "PIEZA",
      tracksExpiration: false,
      cupCapacityOz: 12,
    },
  });

  const vaso3oz = await prisma.ingredient.upsert({
    where: { id: "ing-vaso-3oz" },
    update: { cupCapacityOz: 3 },
    create: {
      id: "ing-vaso-3oz",
      name: "Vaso Espresso 3oz",
      category: "INSUMOS",
      kind: "ATOMICO",
      baseUnit: "PIEZA",
      purchaseUnit: "PIEZA",
      tracksExpiration: false,
      cupCapacityOz: 3,
    },
  });

  const vaso8oz = await prisma.ingredient.upsert({
    where: { id: "ing-vaso-8oz" },
    update: { cupCapacityOz: 8 },
    create: {
      id: "ing-vaso-8oz",
      name: "Vaso 8oz",
      category: "INSUMOS",
      kind: "ATOMICO",
      baseUnit: "PIEZA",
      purchaseUnit: "PIEZA",
      tracksExpiration: false,
      cupCapacityOz: 8,
    },
  });

  const vaso16oz = await prisma.ingredient.upsert({
    where: { id: "ing-vaso-16oz" },
    update: { cupCapacityOz: 16 },
    create: {
      id: "ing-vaso-16oz",
      name: "Vaso 16oz",
      category: "INSUMOS",
      kind: "ATOMICO",
      baseUnit: "PIEZA",
      purchaseUnit: "PIEZA",
      tracksExpiration: false,
      cupCapacityOz: 16,
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

  console.log("Sembrando leches alternativas (Tipo de leche)...");

  // "Tipo de leche" (punto 5, Mejoras avanzadas de POS): Entera es la
  // base de toda receta con leche; estas son las alternativas reales del
  // menú (Light/Deslactosada/Deslactosada Light/Soya), con costo
  // ESTIMADO (ver constantes arriba) porque el negocio no dio precio real
  // por litro — se puede ajustar después en /compras/proveedores.
  const milkAlternativesData: { id: string; name: string; costPerMl: number }[] = [
    { id: "ing-lapso-leche-light", name: "Light", costPerMl: COSTO_LECHE_LIGHT_POR_ML },
    { id: "ing-lapso-leche-deslactosada", name: "Deslactosada", costPerMl: COSTO_LECHE_DESLACTOSADA_POR_ML },
    {
      id: "ing-lapso-leche-deslactosada-light",
      name: "Deslactosada Light",
      costPerMl: COSTO_LECHE_DESLACTOSADA_LIGHT_POR_ML,
    },
    { id: "ing-lapso-leche-soya", name: "Soya", costPerMl: COSTO_LECHE_SOYA_POR_ML },
  ];

  const milkAlternatives: { id: string; name: string; costPerMl: number }[] = [];
  for (const milk of milkAlternativesData) {
    await prisma.ingredient.upsert({
      where: { id: milk.id },
      update: {},
      create: {
        id: milk.id,
        name: `Leche ${milk.name}`,
        category: "LECHE",
        kind: "ATOMICO",
        baseUnit: "ML",
        purchaseUnit: "L",
      },
    });
    milkAlternatives.push(milk);
  }

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
    { ingredientId: vaso3oz.id, cost: COSTO_VASO_3OZ },
    { ingredientId: vaso8oz.id, cost: COSTO_VASO_8OZ },
    { ingredientId: vaso12oz.id, cost: COSTO_VASO_12OZ },
    { ingredientId: vaso16oz.id, cost: COSTO_VASO_16OZ },
    { ingredientId: agua.id, cost: COSTO_AGUA_POR_ML },
    { ingredientId: hielo.id, cost: COSTO_HIELO_POR_G },
    { ingredientId: esenciaSabor.id, cost: COSTO_ESENCIA_POR_ML },
    ...milkAlternatives.map((m) => ({ ingredientId: m.id, cost: m.costPerMl })),
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
    { ingredientId: vaso3oz.id, quantity: 500 },
    { ingredientId: vaso8oz.id, quantity: 1000 },
    { ingredientId: vaso12oz.id, quantity: 1000 },
    { ingredientId: vaso16oz.id, quantity: 1000 },
    { ingredientId: agua.id, quantity: 20000 },
    { ingredientId: hielo.id, quantity: 30000 },
    { ingredientId: esenciaSabor.id, quantity: 20000 },
    ...milkAlternatives.map((m) => ({ ingredientId: m.id, quantity: 10000 })),
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

  console.log("Sembrando árbol de categorías y menú real de LAPSO...");

  async function category(name: string, parentId?: string): Promise<string> {
    const cat = await prisma.productCategory.upsert({
      where: { name },
      update: { parentId: parentId ?? null },
      create: { name, parentId: parentId ?? null },
    });
    return cat.id;
  }

  // Árbol de 2 niveles (punto 2, Mejoras avanzadas de POS) — los padres no
  // llevan productos directos (excepto "Café en grano", que no tiene
  // hijas y actúa como categoría de un solo nivel, igual que antes).
  const catCafeEspresso = await category("Café y Espresso");
  const catChocolatesTes = await category("Chocolates y Tés");
  const catBebidasFrias = await category("Bebidas Frías");
  const catBocadillosPadre = await category("Bocadillos");
  const catPostres = await category("Postres");
  const catSouvenirsTarjetas = await category("Souvenirs y Tarjetas");

  const catChocolates = await category("Chocolates", catChocolatesTes);
  const catTe = await category("Té e Infusiones", catChocolatesTes);
  const catTisanas = await category("Tisanas", catChocolatesTes);
  const catSmoothie = await category("Smoothie", catBebidasFrias);
  const catChai = await category("Chai", catChocolatesTes);
  const catMalteada = await category("Malteada", catBebidasFrias);
  const catSoda = await category("Soda Italiana", catBebidasFrias);
  const catCafe = await category("Café", catCafeEspresso);
  const catEspresso = await category("Espresso", catCafeEspresso);
  const catCapuccinos = await category("Capuccinos", catCafeEspresso);
  const catLatte = await category("Latte", catCafeEspresso);
  const catBagels = await category("Bagels", catBocadillosPadre);
  const catOtrosBocadillos = await category("Otros Bocadillos", catBocadillosPadre);
  const catGalletas = await category("Galletas", catPostres);
  const catPasteles = await category("Pasteles", catPostres);
  const catPiesTartas = await category("Pies y Tartas", catPostres);
  const catMacarons = await category("Macarons", catPostres);
  const catSouvenirs = await category("Souvenirs", catSouvenirsTarjetas);
  const catTarjetaRegalo = await category("Tarjeta de regalo", catSouvenirsTarjetas);
  const catCafeGrano = await category("Café en grano");

  // -----------------------------------------------------------------------
  // Recetas por familia de bebida — fórmulas aproximadas, mismo criterio en
  // toda la categoría (no una por producto), documentadas aquí en vez de
  // repetidas como comentario en cada línea. El vaso ya NO se agrega aquí
  // — se descuenta automáticamente por ProductVariant.sizeOz (actions/pos.ts).
  // Escalado por tamaño: índice 0 = Chico, 1 = Mediano, 2 = Grande.
  // -----------------------------------------------------------------------

  // Café/agua, sin leche — Americano y similares.
  function recetaAmericano(i: number, shots: number[], aguaMl: number[], hieloG?: number[]): RecipeLineSpec[] {
    const lines: RecipeLineSpec[] = [
      { ingredientId: cafe.id, quantity: shots[i], unit: "ESPRESSO_SHOT" },
      { ingredientId: agua.id, quantity: aguaMl[i], unit: "ML" },
    ];
    if (hieloG) lines.push({ ingredientId: hielo.id, quantity: hieloG[i], unit: "G" });
    return lines;
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
    return lines;
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
    return lines;
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
    return lines;
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
      const vId = variantId(spec.id, variant);
      const productVariant = await prisma.productVariant.upsert({
        where: { id: vId },
        update: {
          name: variant.label,
          price: variant.price,
          isActive: true,
          temperature: variant.temperature ?? null,
          sizeOz: variant.sizeOz ?? null,
        },
        create: {
          id: vId,
          productId: product.id,
          name: variant.label,
          price: variant.price,
          temperature: variant.temperature ?? null,
          sizeOz: variant.sizeOz ?? null,
        },
      });

      if (variant.recipe) {
        const recipeId = `${vId}-recipe`;
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
        const groupId = `${vId}-flavor`;
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

      // "Tipo de leche" (punto 5, Mejoras avanzadas de POS): Entera sin
      // costo (ya es la base de la receta) + alternativas como
      // sustitución real con priceDelta = diferencia de costo × la misma
      // cantidad de ml que ya usa esta variante — mismo mecanismo de
      // sustitución por categoría (LECHE) ya construido en actions/pos.ts.
      if (variant.milkMl) {
        const milkMl = variant.milkMl;
        const groupId = `${vId}-leche`;
        const group = await prisma.variantModifierGroup.upsert({
          where: { id: groupId },
          update: {},
          create: {
            id: groupId,
            productVariantId: productVariant.id,
            name: "Tipo de leche",
            isRequired: false,
            allowMultiple: false,
          },
        });

        // Id determinístico por ingrediente (no por el nombre corto de
        // exhibición) — mismo esquema que actions/recipes.ts
        // (applyModifierGroups), para que re-sembrar y editar una
        // variante desde /productos actualicen las mismas filas en vez
        // de duplicarlas. Migrado desde el esquema anterior (`-entera`,
        // `-${slug(nombre)}`) el 2026-09-12.
        await prisma.modifierOption.upsert({
          where: { id: `${groupId}-base` },
          update: {},
          create: { id: `${groupId}-base`, groupId: group.id, name: "Entera", priceDelta: 0 },
        });

        for (const milk of milkAlternatives) {
          const priceDelta = Math.round((milk.costPerMl - COSTO_LECHE_POR_ML) * milkMl * 100) / 100;
          await prisma.modifierOption.upsert({
            where: { id: `${groupId}-${milk.id}` },
            update: {},
            create: {
              id: `${groupId}-${milk.id}`,
              groupId: group.id,
              name: milk.name,
              priceDelta,
              ingredientId: milk.id,
              quantityDelta: milkMl,
              unit: "ML",
              isSubstitution: true,
            },
          });
        }
      }
    }

    // Si el producto cambió su conjunto de variantes entre corridas, las
    // que ya no están en spec.variants se desactivan — nunca se borran
    // (mismo criterio de "desactivar, no borrar" del resto del script),
    // así que no se pierden ventas históricas que las usaron.
    const currentVariantIds = spec.variants.map((v) => variantId(spec.id, v));
    await prisma.productVariant.updateMany({
      where: { productId: product.id, id: { notIn: currentVariantIds }, isActive: true },
      data: { isActive: false },
    });
  }

  // -----------------------------------------------------------------------
  // CAFÉ — "Americano" consolida Americano/Americano Frío en un producto,
  // con temperatura como campo real (no texto en el nombre).
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-americano",
    name: "Americano",
    categoryId: catCafe,
    variants: [
      { label: "Chico", temperature: "CALIENTE", price: 27, sizeOz: SIZE_OZ.Chico, recipe: recetaAmericano(0, [1, 1, 2], [150, 200, 250]) },
      { label: "Mediano", temperature: "CALIENTE", price: 34, sizeOz: SIZE_OZ.Mediano, recipe: recetaAmericano(1, [1, 1, 2], [150, 200, 250]) },
      { label: "Grande", temperature: "CALIENTE", price: 37, sizeOz: SIZE_OZ.Grande, recipe: recetaAmericano(2, [1, 1, 2], [150, 200, 250]) },
      { label: "Chico", temperature: "FRIO", price: 28, sizeOz: SIZE_OZ.Chico, recipe: recetaAmericano(0, [1, 1, 2], [100, 130, 160], [100, 130, 160]) },
      { label: "Mediano", temperature: "FRIO", price: 35, sizeOz: SIZE_OZ.Mediano, recipe: recetaAmericano(1, [1, 1, 2], [100, 130, 160], [100, 130, 160]) },
      { label: "Grande", temperature: "FRIO", price: 39, sizeOz: SIZE_OZ.Grande, recipe: recetaAmericano(2, [1, 1, 2], [100, 130, 160], [100, 130, 160]) },
    ],
  });
  await seedProduct({
    id: "lapso-prensa-francesa",
    name: "Prensa Francesa",
    categoryId: catCafe,
    variants: [
      {
        label: "Único",
        price: 55,
        sizeOz: SIZE_OZ.Mediano,
        recipe: [
          { ingredientId: cafe.id, quantity: 3, unit: "ESPRESSO_SHOT" },
          { ingredientId: agua.id, quantity: 300, unit: "ML" },
        ],
      },
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
      { label: "Chico", price: 36, sizeOz: SIZE_OZ.Chico, recipe: recetaAmericano(0, [1, 1, 2], [100, 130, 160]) },
      { label: "Mediano", price: 45, sizeOz: SIZE_OZ.Mediano, recipe: recetaAmericano(1, [1, 1, 2], [100, 130, 160]) },
      { label: "Grande", price: 50, sizeOz: SIZE_OZ.Grande, recipe: recetaAmericano(2, [1, 1, 2], [100, 130, 160]) },
    ],
  });
  await seedProduct({
    id: "lapso-espresso",
    name: "Espresso",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 26, sizeOz: 3, recipe: [{ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }] },
      { label: "Doble", price: 31, sizeOz: 3, recipe: [{ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }] },
    ],
  });
  await seedProduct({
    id: "lapso-cortado",
    name: "Cortado",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 32, sizeOz: 3, milkMl: 20, recipe: [{ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 20, unit: "ML" }] },
      { label: "Doble", price: 37, sizeOz: 3, milkMl: 30, recipe: [{ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 30, unit: "ML" }] },
    ],
  });
  await seedProduct({
    id: "lapso-macciato",
    name: "Macciato",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 32, sizeOz: 3, milkMl: 10, recipe: [{ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 10, unit: "ML" }] },
      { label: "Doble", price: 37, sizeOz: 3, milkMl: 15, recipe: [{ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }, { ingredientId: leche.id, quantity: 15, unit: "ML" }] },
    ],
  });
  await seedProduct({
    id: "lapso-con-panna",
    name: "Con Panna",
    categoryId: catEspresso,
    variants: [
      { label: "Sencillo", price: 36, sizeOz: 3, recipe: [{ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" }, { ingredientId: cremaBatida.id, quantity: 1, unit: "PIEZA" }] },
      { label: "Doble", price: 41, sizeOz: 3, recipe: [{ ingredientId: cafe.id, quantity: 2, unit: "ESPRESSO_SHOT" }, { ingredientId: cremaBatida.id, quantity: 1, unit: "PIEZA" }] },
    ],
  });

  // -----------------------------------------------------------------------
  // CAPUCCINOS
  // -----------------------------------------------------------------------
  const lecheCapuccinoMl = [150, 200, 250];
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
        sizeOz: SIZE_OZ[label],
        milkMl: lecheCapuccinoMl[i],
        recipe: recetaCafeConLeche(i, [1, 1, 2], lecheCapuccinoMl, c.esencia),
      })),
    });
  }

  // -----------------------------------------------------------------------
  // LATTE — "Latte" consolida Latte Caliente/Frío; Banana sigue aparte.
  // -----------------------------------------------------------------------
  const lecheLatteCalienteMl = [180, 220, 260];
  const lecheLatteFrioMl = [150, 190, 220];
  await seedProduct({
    id: "lapso-latte",
    name: "Latte",
    categoryId: catLatte,
    variants: [
      { label: "Chico", temperature: "CALIENTE", price: 43, sizeOz: SIZE_OZ.Chico, milkMl: lecheLatteCalienteMl[0], recipe: recetaCafeConLeche(0, [1, 1, 2], lecheLatteCalienteMl) },
      { label: "Mediano", temperature: "CALIENTE", price: 49, sizeOz: SIZE_OZ.Mediano, milkMl: lecheLatteCalienteMl[1], recipe: recetaCafeConLeche(1, [1, 1, 2], lecheLatteCalienteMl) },
      { label: "Grande", temperature: "CALIENTE", price: 54, sizeOz: SIZE_OZ.Grande, milkMl: lecheLatteCalienteMl[2], recipe: recetaCafeConLeche(2, [1, 1, 2], lecheLatteCalienteMl) },
      { label: "Chico", temperature: "FRIO", price: 45, sizeOz: SIZE_OZ.Chico, milkMl: lecheLatteFrioMl[0], recipe: recetaCafeConLeche(0, [1, 1, 2], lecheLatteFrioMl, undefined, [100, 130, 160]) },
      { label: "Mediano", temperature: "FRIO", price: 52, sizeOz: SIZE_OZ.Mediano, milkMl: lecheLatteFrioMl[1], recipe: recetaCafeConLeche(1, [1, 1, 2], lecheLatteFrioMl, undefined, [100, 130, 160]) },
      { label: "Grande", temperature: "FRIO", price: 57, sizeOz: SIZE_OZ.Grande, milkMl: lecheLatteFrioMl[2], recipe: recetaCafeConLeche(2, [1, 1, 2], lecheLatteFrioMl, undefined, [100, 130, 160]) },
    ],
  });
  const lecheLatteBananaMl = [180, 220, 260];
  await seedProduct({
    id: "lapso-latte-banana",
    name: "Latte Banana",
    categoryId: catLatte,
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [52, 60, 66][i],
      sizeOz: SIZE_OZ[label],
      milkMl: lecheLatteBananaMl[i],
      recipe: recetaCafeConLeche(i, [1, 1, 2], lecheLatteBananaMl, [5, 7, 10]),
    })),
  });

  // -----------------------------------------------------------------------
  // CHOCOLATES — "Chocolate" consolida Frío/Tradicional(Caliente); el
  // resto de sabores solo existen en un estado en el menú real.
  // -----------------------------------------------------------------------
  const lecheChocolateMl = [180, 220, 260];
  await seedProduct({
    id: "lapso-chocolate",
    name: "Chocolate",
    categoryId: catChocolates,
    variants: [
      { label: "Chico", temperature: "CALIENTE", price: 42, sizeOz: SIZE_OZ.Chico, milkMl: lecheChocolateMl[0], recipe: recetaLecheEsencia(0, lecheChocolateMl, [8, 10, 12]) },
      { label: "Mediano", temperature: "CALIENTE", price: 48, sizeOz: SIZE_OZ.Mediano, milkMl: lecheChocolateMl[1], recipe: recetaLecheEsencia(1, lecheChocolateMl, [8, 10, 12]) },
      { label: "Grande", temperature: "CALIENTE", price: 53, sizeOz: SIZE_OZ.Grande, milkMl: lecheChocolateMl[2], recipe: recetaLecheEsencia(2, lecheChocolateMl, [8, 10, 12]) },
      { label: "Chico", temperature: "FRIO", price: 42, sizeOz: SIZE_OZ.Chico, milkMl: lecheChocolateMl[0], recipe: recetaLecheEsencia(0, lecheChocolateMl, [8, 10, 12]) },
      { label: "Mediano", temperature: "FRIO", price: 48, sizeOz: SIZE_OZ.Mediano, milkMl: lecheChocolateMl[1], recipe: recetaLecheEsencia(1, lecheChocolateMl, [8, 10, 12]) },
      { label: "Grande", temperature: "FRIO", price: 53, sizeOz: SIZE_OZ.Grande, milkMl: lecheChocolateMl[2], recipe: recetaLecheEsencia(2, lecheChocolateMl, [8, 10, 12]) },
    ],
  });

  await seedProduct({
    id: "lapso-chocolate-tradicional-agua",
    name: "Tradicional en Agua",
    categoryId: catChocolates,
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [40, 46, 51][i],
      sizeOz: SIZE_OZ[label],
      recipe: recetaAguaEsencia(i, [200, 250, 300], [8, 10, 12]),
    })),
  });

  const otrosChocolates: { id: string; name: string; price: [number, number, number]; esencia: [number, number, number] }[] = [
    { id: "lapso-chocolate-extra-amargo", name: "Chocolate Extra Amargo", price: [45, 52, 57], esencia: [10, 12, 14] },
    { id: "lapso-chocolate-espanol", name: "Chocolate Español", price: [45, 52, 57], esencia: [10, 12, 14] },
    { id: "lapso-chocolate-lapso", name: "Chocolate LAPSO", price: [54, 62, 68], esencia: [12, 15, 18] },
    { id: "lapso-chocomenta-caliente", name: "Chocomenta Caliente", price: [52, 60, 66], esencia: [10, 12, 14] },
    { id: "lapso-carturo", name: "Carturo", price: [45, 52, 57], esencia: [10, 12, 14] },
  ];
  for (const c of otrosChocolates) {
    await seedProduct({
      id: c.id,
      name: c.name,
      categoryId: catChocolates,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
        label,
        price: c.price[i],
        sizeOz: SIZE_OZ[label],
        milkMl: lecheChocolateMl[i],
        recipe: recetaLecheEsencia(i, lecheChocolateMl, c.esencia),
      })),
    });
  }

  // -----------------------------------------------------------------------
  // TÉ — antes vivía como grupo de modificador "Temperatura" sin costo,
  // pero el menú real cobra distinto por Frío ($39/43/47) que por
  // Caliente ($37/41/45) — se modela con el campo real
  // ProductVariant.temperature (no un modificador), sin receta (no hay
  // costo de té/hierbas dado).
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-te",
    name: "Té",
    categoryId: catTe,
    variants: [
      { label: "Chico", temperature: "CALIENTE", price: 37, sizeOz: SIZE_OZ.Chico },
      { label: "Mediano", temperature: "CALIENTE", price: 41, sizeOz: SIZE_OZ.Mediano },
      { label: "Grande", temperature: "CALIENTE", price: 45, sizeOz: SIZE_OZ.Grande },
      { label: "Chico", temperature: "FRIO", price: 39, sizeOz: SIZE_OZ.Chico },
      { label: "Mediano", temperature: "FRIO", price: 43, sizeOz: SIZE_OZ.Mediano },
      { label: "Grande", temperature: "FRIO", price: 47, sizeOz: SIZE_OZ.Grande },
    ],
  });

  // -----------------------------------------------------------------------
  // TISANAS — "Tisana" consolida Caliente/Fría; Cristal/Yogurt/Frappé son
  // especialidades que el menú real solo ofrece en un estado.
  // -----------------------------------------------------------------------
  await seedProduct({
    id: "lapso-tisana",
    name: "Tisana",
    categoryId: catTisanas,
    variants: [
      { label: "Chico", temperature: "CALIENTE", price: 37, sizeOz: SIZE_OZ.Chico },
      { label: "Mediano", temperature: "CALIENTE", price: 41, sizeOz: SIZE_OZ.Mediano },
      { label: "Grande", temperature: "CALIENTE", price: 45, sizeOz: SIZE_OZ.Grande },
      { label: "Chico", temperature: "FRIO", price: 39, sizeOz: SIZE_OZ.Chico },
      { label: "Mediano", temperature: "FRIO", price: 43, sizeOz: SIZE_OZ.Mediano },
      { label: "Grande", temperature: "FRIO", price: 47, sizeOz: SIZE_OZ.Grande },
    ],
  });

  const tisanasEspeciales: { id: string; name: string; price: [number, number, number] }[] = [
    { id: "lapso-tisana-cristal", name: "Tisana Cristal", price: [47, 54, 59] },
    { id: "lapso-tisana-yogurt", name: "Tisana Yogurt", price: [47, 54, 59] },
    { id: "lapso-tisana-frappe", name: "Tisana Frappé", price: [52, 60, 66] },
  ];
  for (const t of tisanasEspeciales) {
    await seedProduct({
      id: t.id,
      name: t.name,
      categoryId: catTisanas,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({ label, price: t.price[i], sizeOz: SIZE_OZ[label] })),
    });
  }

  // -----------------------------------------------------------------------
  // SMOOTHIE
  // -----------------------------------------------------------------------
  const lecheSmoothieMl = [150, 180, 210];
  const smoothies = ["Chamoy", "Mango Maracuyá", "Tamarindo"];
  for (const flavor of smoothies) {
    await seedProduct({
      id: `lapso-smoothie-${slug(flavor)}`,
      name: `Smoothie ${flavor}`,
      categoryId: catSmoothie,
      variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
        label,
        price: [43, 48, 53][i],
        sizeOz: SIZE_OZ[label],
        milkMl: lecheSmoothieMl[i],
        recipe: recetaLecheEsencia(i, lecheSmoothieMl, [10, 13, 16], [80, 100, 120]),
      })),
    });
  }

  // -----------------------------------------------------------------------
  // CHAI / DIRTY CHAI — "Chai" y "Dirty Chai" consolidan Frío/Caliente/
  // Frappé como campo real de temperatura (9 variantes: 3 tamaños × 3
  // temperaturas), conservando el grupo de sabor (Tradicional/Té Verde/
  // Manzana, sin costo) en cada una. "Dirty" agrega un shot de espresso
  // constante.
  // -----------------------------------------------------------------------
  const saborChai = { name: "Sabor", options: ["Tradicional", "Té Verde", "Manzana"] };
  const lecheChaiMl = [150, 200, 250];

  type ChaiTemp = { temperature: VariantTemperature; price: [number, number, number]; hielo?: [number, number, number] };
  const chaiTemps: ChaiTemp[] = [
    { temperature: "CALIENTE", price: [47, 54, 59] },
    { temperature: "FRIO", price: [48, 55, 61], hielo: [80, 100, 120] },
    { temperature: "FRAPPE", price: [56, 63, 69], hielo: [100, 130, 160] },
  ];
  const dirtyChaiTemps: ChaiTemp[] = [
    { temperature: "CALIENTE", price: [51, 57, 63] },
    { temperature: "FRIO", price: [52, 58, 64], hielo: [80, 100, 120] },
    { temperature: "FRAPPE", price: [59, 66, 73], hielo: [100, 130, 160] },
  ];

  function buildChaiVariants(temps: ChaiTemp[], dirty: boolean) {
    const variants: VariantSpec[] = [];
    (["Chico", "Mediano", "Grande"] as const).forEach((size, i) => {
      for (const temp of temps) {
        const lines = recetaLecheEsencia(i, lecheChaiMl, [6, 8, 10], temp.hielo);
        if (dirty) {
          lines.unshift({ ingredientId: cafe.id, quantity: 1, unit: "ESPRESSO_SHOT" });
        }
        variants.push({
          label: size,
          temperature: temp.temperature,
          price: temp.price[i],
          sizeOz: SIZE_OZ[size],
          milkMl: lecheChaiMl[i],
          recipe: lines,
        });
      }
    });
    return variants;
  }

  await seedProduct({
    id: "lapso-chai",
    name: "Chai",
    categoryId: catChai,
    flavorGroup: saborChai,
    variants: buildChaiVariants(chaiTemps, false),
  });
  await seedProduct({
    id: "lapso-dirty-chai",
    name: "Dirty Chai",
    categoryId: catChai,
    flavorGroup: saborChai,
    variants: buildChaiVariants(dirtyChaiTemps, true),
  });

  // -----------------------------------------------------------------------
  // MALTEADA — sabor sin costo, un solo producto.
  // -----------------------------------------------------------------------
  const lecheMalteadaMl = [180, 220, 260];
  await seedProduct({
    id: "lapso-malteada",
    name: "Malteada",
    categoryId: catMalteada,
    flavorGroup: { name: "Sabor", options: ["Chocolate", "Vainilla", "Fresa"] },
    variants: (["Chico", "Mediano", "Grande"] as const).map((label, i) => ({
      label,
      price: [43, 49, 54][i],
      sizeOz: SIZE_OZ[label],
      milkMl: lecheMalteadaMl[i],
      recipe: recetaLecheEsencia(i, lecheMalteadaMl, [8, 10, 12], [60, 80, 100]),
    })),
  });

  // -----------------------------------------------------------------------
  // SODA ITALIANA — mismo criterio, muchas más opciones de sabor. Sin
  // leche (agua + esencia), no gana grupo de tipo de leche.
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
      sizeOz: SIZE_OZ[label],
      recipe: recetaAguaEsencia(i, [150, 180, 210], [15, 20, 25], [100, 130, 160]),
    })),
  });

  // -----------------------------------------------------------------------
  // BOCADILLOS (Bagels / Otros Bocadillos), POSTRES, SOUVENIRS, TARJETA DE
  // REGALO, CAFÉ EN GRANO — reventa directa: precio único, sin receta (no
  // pasan por el modelo de consumo por ingrediente, ver
  // ProductType.REVENTA_DIRECTA en el schema). Sin sizeOz — no son bebidas.
  // -----------------------------------------------------------------------
  const bagels: { id: string; name: string; price: number }[] = [
    { id: "lapso-bagel-jamon-pavo", name: "Bagel (Jamón Serrano o de Pavo)", price: 66 },
    { id: "lapso-bagel-chipotle-queso", name: "Bagel Chipotle y Queso", price: 68 },
    { id: "lapso-bagel-queso-mermelada", name: "Bagel con Queso Crema y Mermelada", price: 40 },
  ];
  for (const b of bagels) {
    await seedProduct({
      id: b.id,
      name: b.name,
      categoryId: catBagels,
      type: "REVENTA_DIRECTA",
      isPerishable: true,
      variants: [{ label: "Único", price: b.price }],
    });
  }

  const otrosBocadillos: { id: string; name: string; price: number }[] = [
    { id: "lapso-croissant", name: "Croissant (Jamón o Vegetariano)", price: 45 },
    { id: "lapso-ciabatta", name: "Ciabatta LAPSO", price: 68 },
    { id: "lapso-ensalada-espinacas", name: "Ensalada de Espinacas", price: 49 },
    { id: "lapso-pizza-pita", name: "Pizza Pita (individual)", price: 57 },
  ];
  for (const b of otrosBocadillos) {
    await seedProduct({
      id: b.id,
      name: b.name,
      categoryId: catOtrosBocadillos,
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
