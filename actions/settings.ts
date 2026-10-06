"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { requirePasswordSession, SessionExpiredError } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { validateThemeSettings, type ThemeSettings } from "@/lib/theme";
import { setAppTimeZone } from "@/lib/time";
import { normalizePhoneMx } from "@/lib/validation";
import { DEFAULT_SETTINGS, isValidTimeZone, type ShortagePolicy, type TaxMode } from "@/lib/settings-shared";
import type { PaymentMethod } from "@prisma/client";

// Configuración global simple (hoy solo el % de food cost objetivo) —
// exclusiva de Administración, mismo patrón que actions/employees.ts:
// sesión de contraseña (no PIN), el actor sale siempre de la sesión del
// servidor.
export const updateTargetFoodCostPercent = safeAction(async function updateTargetFoodCostPercent(percent: number) {
  const actor = await requirePasswordSession();
  if (!actor) {
    throw new SessionExpiredError("Necesitas iniciar sesión de Administración para hacer esto.", "/administracion/login?error=sesion");
  }
  await requirePermission(actor.id, DEFAULT_BRANCH_ID, "CONFIGURACION_SISTEMA_GESTIONAR");

  if (!(percent > 0) || percent > 100) {
    throw new Error("El % de food cost objetivo debe ser mayor que 0 y hasta 100.");
  }

  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: { targetFoodCostPercent: percent },
  });

  revalidatePath("/configuracion/costos");
  revalidatePath("/productos");
});

// Apariencia global (tema, acento, tipografía, tamaño de letra) — mismo
// patrón/permiso que updateTargetFoodCostPercent. Afecta app/layout.tsx,
// que envuelve toda la app, así que revalida desde la raíz.
export const updateAppearanceSettings = safeAction(async function updateAppearanceSettings(input: {
  mode: string;
  color: string;
  backgroundColor?: string | null;
  fontFamily: string;
  fontSize: string;
}): Promise<ThemeSettings> {
  const actor = await requirePasswordSession();
  if (!actor) {
    throw new SessionExpiredError("Necesitas iniciar sesión de Administración para hacer esto.", "/administracion/login?error=sesion");
  }
  await requirePermission(actor.id, DEFAULT_BRANCH_ID, "CONFIGURACION_SISTEMA_GESTIONAR");

  const settings = validateThemeSettings(input);

  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      themeMode: settings.mode,
      themeColor: settings.color,
      themeBackgroundColor: settings.backgroundColor,
      themeFontFamily: settings.fontFamily,
      themeFontSize: settings.fontSize,
    },
  });

  revalidatePath("/", "layout");

  return settings;
});

// =========================================================================
// Secciones de Configuración (lib/navigation.ts CONFIGURACION_SECTIONS).
// Todas: sesión de Administración + CONFIGURACION_SISTEMA_GESTIONAR, y el
// servidor vuelve a validar cada valor (el formulario solo ayuda).
// =========================================================================

async function requireConfigActor() {
  const actor = await requirePasswordSession();
  if (!actor) {
    throw new SessionExpiredError("Necesitas iniciar sesión de Administración para hacer esto.", "/administracion/login?error=sesion");
  }
  await requirePermission(actor.id, DEFAULT_BRANCH_ID, "CONFIGURACION_SISTEMA_GESTIONAR");
  return actor;
}

function wholeNumber(value: number, label: string, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} debe ser un número entero entre ${min} y ${max}.`);
  }
  return value;
}

function money(value: number, label: string, max: number) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${label} debe estar entre $0 y $${max.toLocaleString("es-MX")}.`);
  }
  return Math.round(value * 100) / 100;
}

// Lista de enteros positivos sin repetir, ordenada (propinas, billetes).
function positiveIntList(values: number[], label: string, max: number, maxItems: number) {
  const list = [...new Set(values)].sort((a, b) => a - b);
  if (list.length > maxItems) throw new Error(`${label}: máximo ${maxItems} valores.`);
  for (const v of list) wholeNumber(v, label, 1, max);
  return list;
}

export const updateBusinessInfo = safeAction(async function updateBusinessInfo(input: {
  businessName: string;
  phone: string;
  address: string;
  timeZone: string;
}) {
  await requireConfigActor();
  const businessName = input.businessName.trim();
  if (!businessName) throw new Error("El nombre del negocio es obligatorio.");
  if (businessName.length > 60) throw new Error("El nombre del negocio puede tener hasta 60 caracteres.");
  const address = input.address.trim();
  if (address.length > 200) throw new Error("La dirección puede tener hasta 200 caracteres.");
  if (!isValidTimeZone(input.timeZone)) throw new Error("Zona horaria inválida.");

  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      businessName,
      phone: normalizePhoneMx(input.phone),
      address: address || null,
      timeZone: input.timeZone,
    },
  });
  setAppTimeZone(input.timeZone);
  // Nombre (título, menú, logins) y zona horaria afectan toda la app.
  revalidatePath("/", "layout");
});

const PAYMENT_METHODS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];

export const updatePaymentSettings = safeAction(async function updatePaymentSettings(input: {
  tipPercents: number[];
  highTipThresholdPercent: number;
  paymentMethods: PaymentMethod[];
  cashQuickBills: number[];
}) {
  await requireConfigActor();
  const paymentMethods = PAYMENT_METHODS.filter((m) => input.paymentMethods.includes(m));
  if (paymentMethods.length === 0) throw new Error("Activa al menos un método de pago.");

  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      tipPercents: positiveIntList(input.tipPercents, "Las propinas sugeridas", 100, 6),
      highTipThresholdPercent: wholeNumber(input.highTipThresholdPercent, "El umbral de propina alta", 1, 1000),
      paymentMethods,
      cashQuickBills: positiveIntList(input.cashQuickBills, "Los billetes rápidos", 100_000, 8),
    },
  });
  revalidatePath("/", "layout");
});

export const updateShiftSettings = safeAction(async function updateShiftSettings(input: {
  shiftChangeHour: number;
  defaultOpeningCash: number;
  cashDifferenceTolerance: number;
}) {
  await requireConfigActor();
  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      shiftChangeHour: wholeNumber(input.shiftChangeHour, "La hora de cambio de turno", 1, 23),
      defaultOpeningCash: money(input.defaultOpeningCash, "El fondo de caja sugerido", 100_000),
      cashDifferenceTolerance: money(input.cashDifferenceTolerance, "La tolerancia del corte", 1_000),
    },
  });
  revalidatePath("/", "layout");
});

export const updateLoyaltySettings = safeAction(async function updateLoyaltySettings(input: {
  loyaltyStampsPerReward: number;
  welcomeCouponPercent: number;
  welcomeCouponValidDays: number | null;
}) {
  await requireConfigActor();
  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      loyaltyStampsPerReward: wholeNumber(input.loyaltyStampsPerReward, "Los sellos por recompensa", 1, 20),
      welcomeCouponPercent: wholeNumber(input.welcomeCouponPercent, "El cupón de bienvenida", 0, 100),
      welcomeCouponValidDays:
        input.welcomeCouponValidDays === null
          ? null
          : wholeNumber(input.welcomeCouponValidDays, "La vigencia del cupón (días)", 1, 3650),
    },
  });
  revalidatePath("/", "layout");
});

// Niveles de lealtad (LoyaltyTier): antes solo existían en el seed.
export const saveLoyaltyTier = safeAction(async function saveLoyaltyTier(input: {
  id?: string;
  name: string;
  minLifetimeStamps: number;
  benefits: string;
}) {
  await requireConfigActor();
  const name = input.name.trim();
  if (!name) throw new Error("El nombre del nivel es obligatorio.");
  if (name.length > 40) throw new Error("El nombre del nivel puede tener hasta 40 caracteres.");
  const minLifetimeStamps = wholeNumber(input.minLifetimeStamps, "Las compras para alcanzar el nivel", 0, 100_000);
  const benefits = input.benefits.trim();
  if (benefits.length > 200) throw new Error("Los beneficios pueden tener hasta 200 caracteres.");

  const duplicate = await prisma.loyaltyTier.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) },
  });
  if (duplicate) throw new Error(`Ya existe un nivel llamado ${duplicate.name}.`);

  const data = { name, minLifetimeStamps, benefits: benefits || null };
  if (input.id) {
    await prisma.loyaltyTier.update({ where: { id: input.id }, data });
  } else {
    await prisma.loyaltyTier.create({ data });
  }
  revalidatePath("/configuracion/lealtad");
});

// Borrar un nivel: las tarjetas que lo tenían quedan sin nivel hasta su
// siguiente compra, que recalcula el nivel con los que queden.
export const deleteLoyaltyTier = safeAction(async function deleteLoyaltyTier(id: string) {
  await requireConfigActor();
  await prisma.$transaction([
    prisma.loyaltyCard.updateMany({ where: { tierId: id }, data: { tierId: null } }),
    prisma.loyaltyTier.delete({ where: { id } }),
  ]);
  revalidatePath("/configuracion/lealtad");
});

export const updateDiscountSettings = safeAction(async function updateDiscountSettings(input: {
  maxManualDiscountPercent: number | null;
}) {
  await requireConfigActor();
  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      maxManualDiscountPercent:
        input.maxManualDiscountPercent === null
          ? null
          : wholeNumber(input.maxManualDiscountPercent, "El tope del descuento manual", 1, 100),
    },
  });
  revalidatePath("/", "layout");
});

const SHORTAGE_POLICIES: ShortagePolicy[] = ["CONFIRMAR", "GERENTE", "BLOQUEAR"];

export const updateInventorySettings = safeAction(async function updateInventorySettings(input: {
  shortagePolicy: ShortagePolicy;
}) {
  await requireConfigActor();
  if (!SHORTAGE_POLICIES.includes(input.shortagePolicy)) throw new Error("Opción inválida.");
  await prisma.branch.update({ where: { id: DEFAULT_BRANCH_ID }, data: { shortagePolicy: input.shortagePolicy } });
  revalidatePath("/", "layout");
});

// Mínimos de stock por insumo (ReorderPoint de la ubicación de la
// sucursal): debajo de este valor el insumo se marca "stock bajo" en
// Inventario y en el Dashboard. null = sin mínimo (solo se avisa en 0).
export const updateReorderThresholds = safeAction(async function updateReorderThresholds(
  rows: { ingredientId: string; threshold: number | null }[]
) {
  await requireConfigActor();
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: rows.map((r) => r.ingredientId) } },
    select: { id: true, name: true, baseUnit: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const ingredient = byId.get(row.ingredientId);
      if (!ingredient) continue;
      const where = {
        ingredientId_stockLocationId: { ingredientId: ingredient.id, stockLocationId: DEFAULT_STOCK_LOCATION_ID },
      };
      if (row.threshold === null) {
        await tx.reorderPoint.deleteMany({
          where: { ingredientId: ingredient.id, stockLocationId: DEFAULT_STOCK_LOCATION_ID },
        });
        continue;
      }
      if (!Number.isFinite(row.threshold) || row.threshold < 0 || row.threshold > 1_000_000) {
        throw new Error(`${ingredient.name}: el mínimo debe ser un número entre 0 y 1,000,000.`);
      }
      await tx.reorderPoint.upsert({
        where,
        update: { manualThreshold: row.threshold, unit: ingredient.baseUnit },
        create: {
          ingredientId: ingredient.id,
          stockLocationId: DEFAULT_STOCK_LOCATION_ID,
          manualThreshold: row.threshold,
          unit: ingredient.baseUnit,
        },
      });
    }
  });
  revalidatePath("/configuracion/inventario");
  revalidatePath("/inventario");
  revalidatePath("/administracion");
});

export const updateSecuritySettings = safeAction(async function updateSecuritySettings(input: {
  pinMaxAttempts: number;
  pinLockMinutes: number;
  sessionHours: number;
}) {
  await requireConfigActor();
  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      pinMaxAttempts: wholeNumber(input.pinMaxAttempts, "Los intentos de PIN", 3, 20),
      pinLockMinutes: wholeNumber(input.pinLockMinutes, "Los minutos de bloqueo", 1, 120),
      sessionHours: wholeNumber(input.sessionHours, "La duración de la sesión", 1, 24),
    },
  });
  revalidatePath("/", "layout");
});

const TAX_MODES: TaxMode[] = ["NINGUNO", "INCLUIDO"];

export const updateTaxSettings = safeAction(async function updateTaxSettings(input: {
  taxMode: TaxMode;
  taxRatePercent: number;
}) {
  await requireConfigActor();
  if (!TAX_MODES.includes(input.taxMode)) throw new Error("Opción de impuestos inválida.");
  if (!Number.isFinite(input.taxRatePercent) || input.taxRatePercent < 0 || input.taxRatePercent > 50) {
    throw new Error("La tasa de IVA debe estar entre 0% y 50%.");
  }
  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: { taxMode: input.taxMode, taxRatePercent: Math.round(input.taxRatePercent * 100) / 100 },
  });
  revalidatePath("/", "layout");
});

// Restaura una sección a los valores originales (los @default del schema).
export const resetSettingsSection = safeAction(async function resetSettingsSection(
  section: "cobro" | "caja" | "lealtad" | "descuentos" | "inventario" | "seguridad" | "impuestos"
) {
  await requireConfigActor();
  const d = DEFAULT_SETTINGS;
  const data = {
    cobro: {
      tipPercents: d.tipPercents,
      highTipThresholdPercent: d.highTipThresholdPercent,
      paymentMethods: d.paymentMethods,
      cashQuickBills: d.cashQuickBills,
    },
    caja: {
      shiftChangeHour: d.shiftChangeHour,
      defaultOpeningCash: d.defaultOpeningCash,
      cashDifferenceTolerance: d.cashDifferenceTolerance,
    },
    lealtad: {
      loyaltyStampsPerReward: d.loyaltyStampsPerReward,
      welcomeCouponPercent: d.welcomeCouponPercent,
      welcomeCouponValidDays: d.welcomeCouponValidDays,
    },
    descuentos: { maxManualDiscountPercent: d.maxManualDiscountPercent },
    inventario: { shortagePolicy: d.shortagePolicy },
    seguridad: { pinMaxAttempts: d.pinMaxAttempts, pinLockMinutes: d.pinLockMinutes, sessionHours: d.sessionHours },
    impuestos: { taxMode: d.taxMode, taxRatePercent: d.taxRatePercent },
  }[section];
  await prisma.branch.update({ where: { id: DEFAULT_BRANCH_ID }, data });
  revalidatePath("/", "layout");
});
