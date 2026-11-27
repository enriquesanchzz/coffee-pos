"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID, DEFAULT_STOCK_LOCATION_ID } from "@/lib/constants";
import { requirePasswordSession, SessionExpiredError } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { validateThemeSettings, type ThemeSettings } from "@/lib/theme";
import { setAppTimeZone } from "@/lib/time";
import { normalizePhoneMx, normalizeRfc, normalizeImageUrl } from "@/lib/validation";
import { DEFAULT_SETTINGS, isValidTimeZone, type ShortagePolicy, type TaxMode } from "@/lib/settings-shared";
import type { LoyaltyProgram, LoyaltyRewardType, PaymentMethod, Prisma } from "@prisma/client";
import { activePrograms, loadLoyaltyConfig, lockLoyaltyConfig, syncAllPermanentDiscounts } from "@/lib/loyalty-points";
import { issueDueBirthdayCoupons } from "@/lib/birthdays";

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

// Lo que aparece impreso en el ticket (lib/receipt.ts) además de
// businessName/phone/address, que ya se configuran en Negocio: datos
// fiscales, logo, wifi del local y un mensaje promocional.
export const updateTicketSettings = safeAction(async function updateTicketSettings(input: {
  razonSocial: string;
  rfc: string;
  logoUrl: string;
  ticketFooterMessage: string;
  ticketPromoMessage: string;
  wifiNetwork: string;
  wifiPassword: string;
}) {
  await requireConfigActor();

  const razonSocial = input.razonSocial.trim();
  if (razonSocial.length > 120) throw new Error("La razón social puede tener hasta 120 caracteres.");
  const rfc = normalizeRfc(input.rfc);
  const logoUrl = normalizeImageUrl(input.logoUrl);
  const ticketFooterMessage = input.ticketFooterMessage.trim();
  if (ticketFooterMessage.length > 120) throw new Error("La frase del pie puede tener hasta 120 caracteres.");
  const ticketPromoMessage = input.ticketPromoMessage.trim();
  if (ticketPromoMessage.length > 160) throw new Error("El mensaje promocional puede tener hasta 160 caracteres.");
  const wifiNetwork = input.wifiNetwork.trim();
  if (wifiNetwork.length > 60) throw new Error("El nombre de la red puede tener hasta 60 caracteres.");
  const wifiPassword = input.wifiPassword.trim();
  if (wifiPassword.length > 60) throw new Error("La contraseña del wifi puede tener hasta 60 caracteres.");

  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      razonSocial: razonSocial || null,
      rfc,
      logoUrl,
      ticketFooterMessage: ticketFooterMessage || null,
      ticketPromoMessage: ticketPromoMessage || null,
      wifiNetwork: wifiNetwork || null,
      wifiPassword: wifiPassword || null,
    },
  });

  revalidatePath("/configuracion/ticket");
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
  loyaltyMode: string;
  loyaltyPointsPer100Cafe: number;
  loyaltyPointsPer100PetShop: number;
  loyaltyResetAtTopLevel: boolean;
  welcomeCouponPercent: number;
  welcomeCouponValidDays: number | null;
}) {
  await requireConfigActor();
  if (input.loyaltyMode !== "SEPARADO" && input.loyaltyMode !== "GLOBAL") {
    throw new Error("Elige cómo se acumulan los puntos.");
  }
  const loyaltyMode = input.loyaltyMode;
  await saveLoyaltyChange((tx) => tx.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      loyaltyMode,
      loyaltyPointsPer100Cafe: wholeNumber(input.loyaltyPointsPer100Cafe, "Los puntos por $100 en Cafetería", 0, 1000),
      loyaltyPointsPer100PetShop: wholeNumber(input.loyaltyPointsPer100PetShop, "Los puntos por $100 en Pet Shop", 0, 1000),
      loyaltyResetAtTopLevel: Boolean(input.loyaltyResetAtTopLevel),
      welcomeCouponPercent: wholeNumber(input.welcomeCouponPercent, "El cupón de bienvenida", 0, 100),
      welcomeCouponValidDays:
        input.welcomeCouponValidDays === null
          ? null
          : wholeNumber(input.welcomeCouponValidDays, "La vigencia del cupón (días)", 1, 3650),
    },
  }));
  revalidatePath("/", "layout");
});

// Cupones de cumpleaños (lib/birthdays.ts). No tocan puntos ni niveles, así
// que no pasan por saveLoyaltyChange. Al activarlos se entregan de una vez
// los de quien esté festejando hoy (dentro de la vigencia).
export const updateBirthdaySettings = safeAction(async function updateBirthdaySettings(input: {
  birthdayCustomerPercent: number;
  birthdayPetPercent: number;
  birthdayCouponValidDays: number;
  birthdayLeadDays: number;
}) {
  await requireConfigActor();
  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      birthdayCustomerPercent: wholeNumber(input.birthdayCustomerPercent, "El cupón de cumpleaños del cliente", 0, 100),
      birthdayPetPercent: wholeNumber(input.birthdayPetPercent, "El cupón de cumpleaños de la mascota", 0, 100),
      birthdayCouponValidDays: wholeNumber(input.birthdayCouponValidDays, "La vigencia del cupón de cumpleaños (días)", 1, 60),
      birthdayLeadDays: wholeNumber(input.birthdayLeadDays, "Los días de anticipación de la fecha", 0, 365),
    },
  });
  // Si falla, los ajustes ya quedaron guardados y la revisión de cada hora
  // los entrega (instrumentation.ts).
  await issueDueBirthdayCoupons().catch((err) => console.error("[cumpleaños]", err));
  revalidatePath("/", "layout");
});

// Recordatorios por WhatsApp (lib/reminders.ts). Un mensaje igual al de
// por defecto se guarda como null, para que siga al default si cambia.
export const updateReminderSettings = safeAction(async function updateReminderSettings(input: {
  reminderCafeDays: number;
  reminderCafeMessage: string;
  reminderPetShopDays: number;
  reminderPetShopMessage: string;
}) {
  await requireConfigActor();
  await prisma.branch.update({
    where: { id: DEFAULT_BRANCH_ID },
    data: {
      reminderCafeDays: wholeNumber(input.reminderCafeDays, "Los días sin venir (Cafetería)", 0, 365),
      reminderCafeMessage: reminderMessage(input.reminderCafeMessage, DEFAULT_SETTINGS.reminderCafeMessage, "Cafetería"),
      reminderPetShopDays: wholeNumber(input.reminderPetShopDays, "Los días después de la compra (Pet Shop)", 0, 365),
      reminderPetShopMessage: reminderMessage(
        input.reminderPetShopMessage,
        DEFAULT_SETTINGS.reminderPetShopMessage,
        "Pet Shop"
      ),
    },
  });
  revalidatePath("/", "layout");
});

function reminderMessage(value: string, fallback: string, label: string) {
  const text = value.trim();
  if (!text) throw new Error(`Escribe el mensaje de recordatorio de ${label}.`);
  if (text.length > 500) throw new Error(`El mensaje de recordatorio de ${label} es muy largo (máximo 500 caracteres).`);
  return text === fallback ? null : text;
}

// Todo cambio a los ajustes o niveles de lealtad pasa por aquí: valida la
// combinación resultante y pone al día los descuentos permanentes de todos
// los clientes, en la misma transacción.
async function saveLoyaltyChange(change: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  await prisma.$transaction(
    async (tx) => {
      await lockLoyaltyConfig(tx, "exclusive");
      await change(tx);
      const [config, tiers] = await Promise.all([
        loadLoyaltyConfig(tx),
        tx.loyaltyTier.findMany({ orderBy: { pointsRequired: "asc" } }),
      ]);
      if (config.resetAtTopLevel) {
        for (const program of activePrograms(config.mode)) {
          const programTiers = tiers.filter((t) => t.program === program);
          const topPoints = programTiers.at(-1)?.pointsRequired;
          const top = programTiers.find((t) => t.pointsRequired === topPoints && t.rewardType === "DESCUENTO_PERMANENTE");
          if (top) {
            throw new Error(
              `Con "Reiniciar al llegar al último nivel", el nivel más alto (${top.name}) no puede ser un descuento permanente: se perdería al momento de ganarlo. Cambia su recompensa o desactiva el reinicio.`
            );
          }
        }
      }
      await syncAllPermanentDiscounts(tx);
    },
    { timeout: 60_000 }
  );
}

// Niveles de lealtad por programa (Cafetería / Pet Shop / Global): puntos
// para alcanzarlo y la recompensa que entrega (ver lib/loyalty-points.ts).
export const saveLoyaltyTier = safeAction(async function saveLoyaltyTier(input: {
  id?: string;
  program: string;
  name: string;
  pointsRequired: number;
  benefits: string;
  rewardType: string;
  rewardPercent: number | null;
  rewardVariantId: string | null;
  rewardValidDays: number | null;
}) {
  await requireConfigActor();
  const program = input.program as LoyaltyProgram;
  if (!["CAFE", "PET_SHOP", "GLOBAL"].includes(program)) throw new Error("Programa de lealtad inválido.");
  const rewardType = input.rewardType as LoyaltyRewardType;
  if (!["NINGUNA", "CUPON_PORCENTAJE", "PRODUCTO_GRATIS", "DESCUENTO_PERMANENTE"].includes(rewardType)) {
    throw new Error("Elige qué recompensa da el nivel.");
  }
  const name = input.name.trim();
  if (!name) throw new Error("El nombre del nivel es obligatorio.");
  if (name.length > 40) throw new Error("El nombre del nivel puede tener hasta 40 caracteres.");
  // Un nivel con recompensa pide al menos 1 punto: con 0 (o el campo vacío)
  // se le regalaría a cualquiera en su siguiente compra.
  const pointsRequired = wholeNumber(
    input.pointsRequired,
    "Los puntos para alcanzar el nivel",
    rewardType === "NINGUNA" ? 0 : 1,
    10_000_000
  );
  const benefits = input.benefits.trim();
  if (benefits.length > 200) throw new Error("Los beneficios pueden tener hasta 200 caracteres.");

  const needsPercent = rewardType === "CUPON_PORCENTAJE" || rewardType === "DESCUENTO_PERMANENTE";
  const rewardPercent = needsPercent ? wholeNumber(input.rewardPercent ?? NaN, "El % de descuento", 1, 100) : null;
  let rewardVariantId: string | null = null;
  if (rewardType === "PRODUCTO_GRATIS") {
    if (!input.rewardVariantId) throw new Error("Elige qué producto se regala.");
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.rewardVariantId },
      include: { product: { select: { isActive: true } } },
    });
    if (!variant) throw new Error("Ese producto ya no existe.");
    if (!variant.isActive || !variant.product.isActive) throw new Error("Ese producto está inactivo: no se puede regalar.");
    rewardVariantId = variant.id;
  }
  const isOneTime = rewardType === "CUPON_PORCENTAJE" || rewardType === "PRODUCTO_GRATIS";
  const rewardValidDays =
    isOneTime && input.rewardValidDays !== null ? wholeNumber(input.rewardValidDays, "La vigencia del cupón (días)", 1, 3650) : null;

  const duplicate = await prisma.loyaltyTier.findFirst({
    where: { program, name: { equals: name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) },
  });
  if (duplicate) throw new Error(`Ya existe un nivel llamado ${duplicate.name} en este programa.`);

  const data = { program, name, pointsRequired, benefits: benefits || null, rewardType, rewardPercent, rewardVariantId, rewardValidDays };
  const { id } = input;
  await saveLoyaltyChange((tx) =>
    id ? tx.loyaltyTier.update({ where: { id }, data }) : tx.loyaltyTier.create({ data })
  );
  revalidatePath("/configuracion/lealtad");
});

// Borrar un nivel: el nivel de cada cliente se calcula al vuelo con los
// que queden. Los cupones de un uso ya entregados se respetan; el descuento
// permanente baja al del nivel que le quede al cliente, o se desactiva.
export const deleteLoyaltyTier = safeAction(async function deleteLoyaltyTier(id: string) {
  await requireConfigActor();
  await saveLoyaltyChange(async (tx) => {
    await tx.loyaltyCard.updateMany({ where: { tierId: id }, data: { tierId: null } });
    await tx.loyaltyTier.delete({ where: { id } });
  });
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
  section: "cobro" | "caja" | "lealtad" | "cumpleanos" | "recordatorios" | "descuentos" | "inventario" | "seguridad" | "impuestos"
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
      loyaltyMode: d.loyaltyMode,
      loyaltyPointsPer100Cafe: d.loyaltyPointsPer100Cafe,
      loyaltyPointsPer100PetShop: d.loyaltyPointsPer100PetShop,
      loyaltyResetAtTopLevel: d.loyaltyResetAtTopLevel,
      welcomeCouponPercent: d.welcomeCouponPercent,
      welcomeCouponValidDays: d.welcomeCouponValidDays,
    },
    cumpleanos: {
      birthdayCustomerPercent: d.birthdayCustomerPercent,
      birthdayPetPercent: d.birthdayPetPercent,
      birthdayCouponValidDays: d.birthdayCouponValidDays,
      birthdayLeadDays: d.birthdayLeadDays,
    },
    recordatorios: {
      reminderCafeDays: d.reminderCafeDays,
      reminderCafeMessage: null,
      reminderPetShopDays: d.reminderPetShopDays,
      reminderPetShopMessage: null,
    },
    descuentos: { maxManualDiscountPercent: d.maxManualDiscountPercent },
    inventario: { shortagePolicy: d.shortagePolicy },
    seguridad: { pinMaxAttempts: d.pinMaxAttempts, pinLockMinutes: d.pinLockMinutes, sessionHours: d.sessionHours },
    impuestos: { taxMode: d.taxMode, taxRatePercent: d.taxRatePercent },
  }[section];
  if (section === "lealtad") {
    await saveLoyaltyChange((tx) => tx.branch.update({ where: { id: DEFAULT_BRANCH_ID }, data }));
  } else {
    await prisma.branch.update({ where: { id: DEFAULT_BRANCH_ID }, data });
  }
  revalidatePath("/", "layout");
});
