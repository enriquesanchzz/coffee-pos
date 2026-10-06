import "server-only";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";
import { setAppTimeZone } from "./time";
import {
  DEFAULT_SETTINGS,
  isValidTimeZone,
  type BusinessSettings,
  type ShortagePolicy,
  type TaxMode,
} from "./settings-shared";

const SHORTAGE_POLICIES: ShortagePolicy[] = ["CONFIRMAR", "GERENTE", "BLOQUEAR"];
const TAX_MODES: TaxMode[] = ["NINGUNO", "INCLUIDO"];

// Ajustes de la sucursal con los defaults aplicados — lo único que debe
// leer el resto del código (no las columnas de Branch directo).
export async function getBusinessSettings(): Promise<BusinessSettings> {
  const branch = await prisma.branch.findUnique({ where: { id: DEFAULT_BRANCH_ID } });
  if (!branch) return DEFAULT_SETTINGS;
  const d = DEFAULT_SETTINGS;
  const envTimeZone = process.env.NEXT_PUBLIC_APP_TIME_ZONE || d.timeZone;
  return {
    businessName: branch.businessName?.trim() || d.businessName,
    phone: branch.phone?.trim() || null,
    address: branch.address?.trim() || null,
    timeZone: branch.timeZone && isValidTimeZone(branch.timeZone) ? branch.timeZone : envTimeZone,
    tipPercents: branch.tipPercents ?? d.tipPercents,
    highTipThresholdPercent: branch.highTipThresholdPercent,
    paymentMethods: branch.paymentMethods?.length ? branch.paymentMethods : d.paymentMethods,
    cashQuickBills: branch.cashQuickBills ?? d.cashQuickBills,
    shiftChangeHour: branch.shiftChangeHour,
    defaultOpeningCash: branch.defaultOpeningCash.toNumber(),
    cashDifferenceTolerance: branch.cashDifferenceTolerance.toNumber(),
    loyaltyStampsPerReward: branch.loyaltyStampsPerReward,
    welcomeCouponPercent: branch.welcomeCouponPercent,
    welcomeCouponValidDays: branch.welcomeCouponValidDays,
    maxManualDiscountPercent: branch.maxManualDiscountPercent,
    shortagePolicy: SHORTAGE_POLICIES.includes(branch.shortagePolicy as ShortagePolicy)
      ? (branch.shortagePolicy as ShortagePolicy)
      : d.shortagePolicy,
    pinMaxAttempts: branch.pinMaxAttempts,
    pinLockMinutes: branch.pinLockMinutes,
    sessionHours: branch.sessionHours,
    taxMode: TAX_MODES.includes(branch.taxMode as TaxMode) ? (branch.taxMode as TaxMode) : d.taxMode,
    taxRatePercent: branch.taxRatePercent.toNumber(),
  };
}

// Aplica la zona horaria configurada a lib/time.ts en este proceso.
// Se llama al renderizar (app/layout.tsx) y antes de cada Server Action
// (lib/safe-action.ts), así todo cálculo de "hoy", horarios de promoción
// y reportes usa la zona elegida en Configuración → Negocio.
export async function syncAppTimeZone() {
  const branch = await prisma.branch.findUnique({
    where: { id: DEFAULT_BRANCH_ID },
    select: { timeZone: true },
  });
  const tz =
    branch?.timeZone && isValidTimeZone(branch.timeZone)
      ? branch.timeZone
      : process.env.NEXT_PUBLIC_APP_TIME_ZONE || DEFAULT_SETTINGS.timeZone;
  setAppTimeZone(tz);
  return tz;
}
