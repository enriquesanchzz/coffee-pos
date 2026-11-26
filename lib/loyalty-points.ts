import { randomInt } from "node:crypto";
import type { BusinessUnit, LoyaltyMode, LoyaltyProgram, LoyaltyTier, Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_BRANCH_ID } from "./constants";
import { netByUnit } from "./business-unit";
import { couponLabel, COUPON_LABEL_INCLUDE } from "./coupon-label";

// Lealtad por puntos (reemplaza los sellos). Reglas:
//
// - Puntos por cada $100 cobrados en cada negocio (Configuración →
//   Lealtad): lo cobrado del ticket (después de descuentos, sin propina) se
//   separa entre Cafetería y Pet Shop con netByUnit, y cada parte gana
//   floor(monto × tasa / 100) puntos.
// - Siempre se llevan tres saldos: CAFE, PET_SHOP y GLOBAL (la suma). El
//   modo (SEPARADO / GLOBAL) solo decide cuáles se muestran y en cuáles se
//   evalúan niveles — así cambiar de modo no pierde puntos.
// - Recompensas de una vez (cupón de %, producto gratis): se entregan al
//   CRUZAR el umbral con los puntos de una compra, una vez por ciclo. Nunca
//   por puntos que ya se tenían (conversión, cambio de modo, niveles
//   nuevos): así un cambio de configuración no reparte premios en masa.
// - Descuento permanente: un solo cupón reusable por cliente y programa,
//   derivado del nivel actual (syncPermanentDiscounts). Editar un nivel o
//   cambiar de modo lo actualiza para todos.
// - Con "reiniciar al último nivel", al llegar al nivel más alto los puntos
//   vuelven a 0 (se conserva el excedente) y empieza otro ciclo.
// - Cancelar una venta quita sus puntos, deshace los reinicios que ya no
//   alcanzan y retira los cupones sin usar de niveles que se dejaron de
//   alcanzar. Un cupón ya usado se respeta, y su nivel sigue contando como
//   entregado en ese ciclo (no se puede ganar otra vez cancelando).

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

const ALL_PROGRAMS: LoyaltyProgram[] = ["CAFE", "PET_SHOP", "GLOBAL"];

export const PROGRAM_LABELS: Record<LoyaltyProgram, string> = {
  CAFE: "Cafetería",
  PET_SHOP: "Pet Shop",
  GLOBAL: "Puntos",
};

const PROGRAM_UNIT: Record<LoyaltyProgram, BusinessUnit | null> = {
  CAFE: "CAFE",
  PET_SHOP: "PET_SHOP",
  GLOBAL: null,
};

export function activePrograms(mode: LoyaltyMode): LoyaltyProgram[] {
  return mode === "GLOBAL" ? ["GLOBAL"] : ["CAFE", "PET_SHOP"];
}

export type LoyaltyConfig = {
  mode: LoyaltyMode;
  ratesPer100: Record<BusinessUnit, number>;
  resetAtTopLevel: boolean;
};

export async function loadLoyaltyConfig(db: Db): Promise<LoyaltyConfig> {
  const branch = await db.branch.findUnique({
    where: { id: DEFAULT_BRANCH_ID },
    select: {
      loyaltyMode: true,
      loyaltyPointsPer100Cafe: true,
      loyaltyPointsPer100PetShop: true,
      loyaltyResetAtTopLevel: true,
    },
  });
  return {
    mode: branch?.loyaltyMode ?? "SEPARADO",
    ratesPer100: { CAFE: branch?.loyaltyPointsPer100Cafe ?? 5, PET_SHOP: branch?.loyaltyPointsPer100PetShop ?? 1 },
    resetAtTopLevel: branch?.loyaltyResetAtTopLevel ?? false,
  };
}

export function pointsForSplit(
  split: Record<BusinessUnit, number>,
  rates: Record<BusinessUnit, number>
): Record<LoyaltyProgram, number> {
  // En centavos para que 0.1 + 0.2 no baje un punto al redondear.
  const points = (amount: number, rate: number) => Math.max(0, Math.floor((Math.round(amount * 100) * rate) / 10_000));
  const cafe = points(split.CAFE, rates.CAFE);
  const pet = points(split.PET_SHOP, rates.PET_SHOP);
  return { CAFE: cafe, PET_SHOP: pet, GLOBAL: cafe + pet };
}

async function saleUnitSplit(db: Db, saleId: string) {
  const sale = await db.sale.findUniqueOrThrow({
    where: { id: saleId },
    select: {
      total: true,
      discountCode: { select: { businessUnit: true, productVariantId: true } },
      items: {
        select: {
          lineTotal: true,
          unitPrice: true,
          quantity: true,
          comboId: true,
          productVariantId: true,
          productVariant: { select: { product: { select: { category: { select: { businessUnit: true } } } } } },
        },
      },
    },
  });
  return netByUnit(
    sale.items.map((item) => ({
      unit: item.productVariant?.product.category.businessUnit ?? "CAFE",
      amount: item.lineTotal.toNumber(),
      productVariantId: item.productVariantId,
      discountable: item.comboId === null && item.lineTotal.equals(item.unitPrice.mul(item.quantity)),
    })),
    sale.total.toNumber(),
    sale.discountCode
  );
}

// Un movimiento de puntos a la vez por cliente. NO KEY UPDATE (y no UPDATE)
// porque insertar una venta ya toma KEY SHARE sobre el cliente: dos cobros
// simultáneos se bloquearían mutuamente. Las ventas lo toman al empezar
// (antes de cupones e inventario) para que todos bloqueen en el mismo orden.
export async function lockCustomer(tx: Tx, customerId: string) {
  await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${customerId} FOR NO KEY UPDATE`;
}

// Cambiar ajustes o niveles de lealtad (exclusivo) no se cruza con dar o
// quitar puntos (compartido): si no, una venta que leyó el nivel viejo
// podía dejar un descuento permanente con el % viejo.
const CONFIG_LOCK = 7_406_311;
export async function lockLoyaltyConfig(tx: Tx, mode: "shared" | "exclusive") {
  if (mode === "shared") await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${CONFIG_LOCK})`;
  else await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CONFIG_LOCK})`;
}

// Código legible del cupón (32^6 combinaciones; el @unique lo respalda).
export function rewardCode(prefix: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += alphabet[randomInt(alphabet.length)];
  return `${prefix}-${suffix}`;
}

async function createOneTimeReward(tx: Tx, customerId: string, program: LoyaltyProgram, tier: LoyaltyTier): Promise<string | null> {
  const expiresAt = tier.rewardValidDays ? new Date(Date.now() + tier.rewardValidDays * 86_400_000) : null;
  const base = { customerId, expiresAt, category: "CLIENTE_ESPECIFICO" as const, type: "PORCENTAJE" as const };
  if (tier.rewardType === "CUPON_PORCENTAJE" && tier.rewardPercent) {
    const code = await tx.discountCode.create({
      data: { ...base, code: rewardCode("NIVEL"), value: tier.rewardPercent, businessUnit: PROGRAM_UNIT[program] },
    });
    return code.id;
  }
  if (tier.rewardType === "PRODUCTO_GRATIS" && tier.rewardVariantId) {
    // Un producto que ya no se vende no se regala (el cupón no se podría usar).
    const variant = await tx.productVariant.findUnique({
      where: { id: tier.rewardVariantId },
      select: { isActive: true, product: { select: { isActive: true } } },
    });
    if (!variant?.isActive || !variant.product.isActive) return null;
    // Una pieza de esa variante (checkDiscountCode en actions/pos.ts). Se
    // guarda como "$0 de descuento" para que una versión anterior de la app
    // nunca lo lea como 100% de toda la cuenta.
    const code = await tx.discountCode.create({
      data: { ...base, code: rewardCode("REGALO"), type: "MONTO_FIJO", value: 0, productVariantId: tier.rewardVariantId },
    });
    return code.id;
  }
  return null;
}

// Posición de un cliente en un programa. Un nivel se considera alcanzado si
// es de un ciclo ya cerrado o si sus puntos caben en el ciclo actual.
type Position = { cycle: number; points: number };
function isReached(position: Position, cycle: number, pointsRequired: number) {
  return cycle < position.cycle || (cycle === position.cycle && pointsRequired <= position.points);
}

async function evaluateTiers(
  tx: Tx,
  customerId: string,
  program: LoyaltyProgram,
  config: LoyaltyConfig,
  earned: number,
  saleId: string,
  issueOneTime: boolean
) {
  const tiers = await tx.loyaltyTier.findMany({ where: { program }, orderBy: { pointsRequired: "asc" } });
  if (tiers.length === 0) return;
  const top = tiers[tiers.length - 1];
  const resets = config.resetAtTopLevel && top.pointsRequired > 0;
  const balance = await tx.loyaltyBalance.findUniqueOrThrow({ where: { customerId_program: { customerId, program } } });
  let position: Position = { cycle: balance.cycle, points: balance.points };
  // Lo que ya tenía antes de esta compra: solo lo que pase de aquí se premia.
  let before: Position = { cycle: balance.cycle, points: balance.points - earned };

  async function closeCycle(amount: number) {
    await tx.loyaltyPointsEntry.create({
      data: { customerId, program, points: -amount, reason: "REINICIO", cycle: position.cycle, saleId },
    });
    position = { cycle: position.cycle + 1, points: position.points - amount };
    await tx.loyaltyBalance.update({ where: { id: balance.id }, data: position });
  }

  // Saldo que ya pasaba del tope antes de comprar (se activó el reinicio,
  // se bajó el tope, conversión): se cierra en un solo paso y sin premios.
  if (resets && before.points >= top.pointsRequired) {
    const amount = Math.floor(before.points / top.pointsRequired) * top.pointsRequired;
    await closeCycle(amount);
    before = { cycle: position.cycle, points: before.points - amount };
  }

  for (let guard = 0; guard < 100; guard++) {
    for (const tier of tiers) {
      if (tier.pointsRequired > position.points) break;
      // Solo se registra un nivel que ESTA compra cruzó: así un nivel que
      // se tenía de antes (conversión, umbral editado) no bloquea su
      // recompensa cuando de verdad se cruce.
      const crossed = issueOneTime && !isReached(before, position.cycle, tier.pointsRequired);
      if (!crossed) continue;
      const exists = await tx.loyaltyTierGrant.findUnique({
        where: { customerId_tierId_cycle: { customerId, tierId: tier.id, cycle: position.cycle } },
      });
      if (exists) {
        // Se registró sin premio (el nivel no daba nada entonces) y ahora sí.
        if (!exists.discountCodeId) {
          const discountCodeId = await createOneTimeReward(tx, customerId, program, tier);
          if (discountCodeId) {
            await tx.loyaltyTierGrant.update({
              where: { id: exists.id },
              data: { discountCodeId, saleId, pointsRequired: tier.pointsRequired },
            });
          }
        }
        continue;
      }
      await tx.loyaltyTierGrant.create({
        data: {
          customerId,
          tierId: tier.id,
          program,
          pointsRequired: tier.pointsRequired,
          cycle: position.cycle,
          saleId,
          discountCodeId: await createOneTimeReward(tx, customerId, program, tier),
        },
      });
    }
    if (!resets || position.points < top.pointsRequired) return;
    await closeCycle(top.pointsRequired);
  }
}

// Deja el descuento permanente de cada programa como corresponde al nivel
// actual del cliente: el % del nivel permanente más alto alcanzado, o
// inactivo si no tiene (o si el programa no está en uso).
export async function syncPermanentDiscounts(tx: Tx, customerId: string, config?: LoyaltyConfig) {
  const { mode } = config ?? (await loadLoyaltyConfig(tx));
  const active = activePrograms(mode);
  const [balances, tiers, codes] = await Promise.all([
    tx.loyaltyBalance.findMany({ where: { customerId } }),
    tx.loyaltyTier.findMany({ where: { rewardType: "DESCUENTO_PERMANENTE" }, orderBy: { pointsRequired: "desc" } }),
    tx.discountCode.findMany({ where: { customerId, loyaltyProgram: { not: null } } }),
  ]);
  for (const program of ALL_PROGRAMS) {
    const points = balances.find((b) => b.program === program)?.points ?? 0;
    const tier = active.includes(program)
      ? tiers.find((t) => t.program === program && t.rewardPercent && t.pointsRequired <= points)
      : undefined;
    const code = codes.find((c) => c.loyaltyProgram === program);
    if (tier?.rewardPercent) {
      if (!code) {
        await tx.discountCode.create({
          data: {
            customerId,
            loyaltyProgram: program,
            code: rewardCode("NIVEL"),
            type: "PORCENTAJE",
            value: tier.rewardPercent,
            businessUnit: PROGRAM_UNIT[program],
            isReusable: true,
            category: "CLIENTE_ESPECIFICO",
          },
        });
      } else if (!code.isActive || !code.value.equals(tier.rewardPercent)) {
        await tx.discountCode.update({ where: { id: code.id }, data: { isActive: true, value: tier.rewardPercent } });
      }
    } else if (code?.isActive) {
      await tx.discountCode.update({ where: { id: code.id }, data: { isActive: false } });
    }
  }
}

// Tras cambiar modo o niveles en Configuración: aplica el cambio a todos.
export async function syncAllPermanentDiscounts(tx: Tx) {
  const config = await loadLoyaltyConfig(tx);
  const customers = await tx.loyaltyBalance.findMany({ distinct: ["customerId"], select: { customerId: true } });
  for (const { customerId } of customers) await syncPermanentDiscounts(tx, customerId, config);
}

// Llamado dentro de la transacción de la venta (createSale / closeTab), ya
// con las líneas y el total persistidos. Idempotente por venta.
export async function awardSalePoints(
  tx: Tx,
  saleId: string,
  customerId: string,
  options: { reason?: "VENTA" | "CONVERSION"; issueOneTimeRewards?: boolean } = {}
): Promise<boolean> {
  await lockCustomer(tx, customerId);
  await lockLoyaltyConfig(tx, "shared");
  const already = await tx.loyaltyPointsEntry.findFirst({ where: { saleId, reason: { in: ["VENTA", "CONVERSION"] } } });
  if (already) return false;

  // Clientes de antes de la tarjeta automática: se les crea aquí.
  await tx.loyaltyCard.upsert({ where: { customerId }, update: {}, create: { customerId } });

  const config = await loadLoyaltyConfig(tx);
  const points = pointsForSplit(await saleUnitSplit(tx, saleId), config.ratesPer100);
  for (const program of ALL_PROGRAMS) {
    const earned = points[program];
    await tx.loyaltyBalance.upsert({
      where: { customerId_program: { customerId, program } },
      create: { customerId, program, points: earned, lifetimePoints: earned },
      update: { points: { increment: earned }, lifetimePoints: { increment: earned } },
    });
    // GLOBAL se registra aunque sea 0: marca la venta como procesada (el
    // ticket muestra "+0 pts" y la conversión no la vuelve a tomar).
    if (earned > 0 || program === "GLOBAL") {
      await tx.loyaltyPointsEntry.create({
        data: { customerId, program, points: earned, reason: options.reason ?? "VENTA", saleId },
      });
    }
  }
  for (const program of activePrograms(config.mode)) {
    await evaluateTiers(tx, customerId, program, config, points[program], saleId, options.issueOneTimeRewards ?? true);
  }
  await syncPermanentDiscounts(tx, customerId, config);
  return true;
}

async function withdrawGrant(tx: Tx, grant: { id: string; discountCodeId: string | null }) {
  await tx.loyaltyTierGrant.delete({ where: { id: grant.id } });
  if (grant.discountCodeId) {
    await tx.discountCode.update({ where: { id: grant.discountCodeId }, data: { isActive: false } });
  }
}

// Inverso de awardSalePoints al anular una venta cobrada.
export async function revertSalePoints(tx: Tx, saleId: string, customerId: string) {
  await lockCustomer(tx, customerId);
  await lockLoyaltyConfig(tx, "shared");
  const entries = await tx.loyaltyPointsEntry.findMany({
    where: { saleId, customerId, reason: { in: ["VENTA", "CONVERSION", "CANCELACION"] } },
  });

  for (const program of ALL_PROGRAMS) {
    const earned = entries.filter((e) => e.program === program).reduce((sum, e) => sum + e.points, 0);
    if (earned <= 0) continue;
    const balance = await tx.loyaltyBalance.findUnique({ where: { customerId_program: { customerId, program } } });
    if (!balance) continue;
    const before: Position = { cycle: balance.cycle, points: balance.points };
    const after: Position = { cycle: balance.cycle, points: balance.points - earned };
    await tx.loyaltyPointsEntry.create({ data: { customerId, program, points: -earned, reason: "CANCELACION", saleId } });

    // Reinicios que ya no alcanzan: se deshacen, del más reciente al más
    // viejo, hasta que el saldo vuelva a ser positivo.
    while (after.points < 0 && after.cycle > 0) {
      const reset = await tx.loyaltyPointsEntry.findFirst({
        where: { customerId, program, reason: "REINICIO", cycle: after.cycle - 1, points: { lt: 0 } },
        orderBy: { createdAt: "desc" },
      });
      if (!reset) break;
      after.cycle -= 1;
      after.points -= reset.points;
      await tx.loyaltyPointsEntry.create({
        data: { customerId, program, points: -reset.points, reason: "REINICIO", cycle: after.cycle, saleId },
      });
    }
    await tx.loyaltyBalance.update({
      where: { id: balance.id },
      data: { ...after, lifetimePoints: { decrement: earned } },
    });

    // Niveles que se dejaron de alcanzar por esta cancelación (con el
    // umbral con que se otorgaron, no el de hoy).
    const grants = await tx.loyaltyTierGrant.findMany({
      where: { customerId, program, cycle: { gte: after.cycle } },
      include: { discountCode: { select: { usedAt: true } } },
    });
    for (const grant of grants) {
      const lost = isReached(before, grant.cycle, grant.pointsRequired) && !isReached(after, grant.cycle, grant.pointsRequired);
      if (lost && !grant.discountCode?.usedAt) await withdrawGrant(tx, grant);
    }
  }
  await syncPermanentDiscounts(tx, customerId);
}

// Al anular la venta que USÓ un cupón de nivel, el cupón se libera; si la
// compra que lo ganó ya se anuló y el cliente no alcanza el nivel, se retira
// en vez de quedar disponible. Si la compra que lo ganó sigue en pie, el
// cupón se respeta aunque después se haya subido el umbral del nivel.
export async function withdrawReleasedCouponIfUnearned(tx: Tx, discountCodeId: string) {
  const grant = await tx.loyaltyTierGrant.findUnique({
    where: { discountCodeId },
    include: { sale: { select: { status: true } } },
  });
  if (!grant || grant.sale?.status !== "CANCELADA") return;
  await lockCustomer(tx, grant.customerId);
  const balance = await tx.loyaltyBalance.findUnique({
    where: { customerId_program: { customerId: grant.customerId, program: grant.program } },
  });
  const position: Position = { cycle: balance?.cycle ?? 0, points: balance?.points ?? 0 };
  if (!isReached(position, grant.cycle, grant.pointsRequired)) await withdrawGrant(tx, grant);
}

// ---------------------------------------------------------------------
// Lectura (perfil del cliente, POS, ticket, /lealtad).

export type LoyaltyProgramSummary = {
  program: LoyaltyProgram;
  label: string;
  points: number;
  lifetimePoints: number;
  tier: { name: string; benefits: string | null } | null;
  nextTier: { name: string; pointsRequired: number; missing: number } | null;
};

export async function getLoyaltySummary(db: Db, customerId: string): Promise<LoyaltyProgramSummary[]> {
  const config = await loadLoyaltyConfig(db);
  const programs = activePrograms(config.mode);
  const [balances, tiers] = await Promise.all([
    db.loyaltyBalance.findMany({ where: { customerId, program: { in: programs } } }),
    db.loyaltyTier.findMany({ where: { program: { in: programs } }, orderBy: { pointsRequired: "asc" } }),
  ]);
  return programs.map((program) => {
    const balance = balances.find((b) => b.program === program);
    const points = Math.max(0, balance?.points ?? 0);
    const programTiers = tiers.filter((t) => t.program === program);
    const reached = programTiers.filter((t) => t.pointsRequired <= points);
    const tier = reached[reached.length - 1] ?? null;
    const next = programTiers.find((t) => t.pointsRequired > points) ?? null;
    return {
      program,
      label: PROGRAM_LABELS[program],
      points,
      lifetimePoints: balance?.lifetimePoints ?? 0,
      tier: tier ? { name: tier.name, benefits: tier.benefits } : null,
      nextTier: next ? { name: next.name, pointsRequired: next.pointsRequired, missing: next.pointsRequired - points } : null,
    };
  });
}

// Para el ticket: puntos que dio esta venta por programa (netos de una
// cancelación) + el saldo y nivel actuales del cliente.
export type SaleLoyaltySummary = {
  programs: (LoyaltyProgramSummary & { earned: number })[];
  rewards: { tierName: string; reward: string | null; code: string | null }[];
};

export async function getSaleLoyaltySummary(db: Db, saleId: string, customerId: string): Promise<SaleLoyaltySummary | null> {
  const [summary, entries, grants] = await Promise.all([
    getLoyaltySummary(db, customerId),
    db.loyaltyPointsEntry.findMany({ where: { saleId, customerId, reason: { in: ["VENTA", "CONVERSION", "CANCELACION"] } } }),
    db.loyaltyTierGrant.findMany({
      where: { saleId, customerId },
      include: { tier: true, discountCode: { include: COUPON_LABEL_INCLUDE } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (entries.length === 0) return null; // ventas de antes de los puntos (o sin cliente)
  return {
    programs: summary.map((p) => ({
      ...p,
      earned: entries.filter((e) => e.program === p.program).reduce((sum, e) => sum + e.points, 0),
    })),
    rewards: grants.map((g) => ({
      tierName: g.tier?.name ?? "un nivel",
      reward: g.discountCode
        ? couponLabel(g.discountCode)
        : g.tier?.rewardType === "DESCUENTO_PERMANENTE"
          ? `${g.tier.rewardPercent}% en cada compra`
          : null,
      code: g.discountCode?.isActive && !g.discountCode.usedAt ? g.discountCode.code : null,
    })),
  };
}
