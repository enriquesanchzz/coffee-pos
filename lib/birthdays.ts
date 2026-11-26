import { Prisma, type BusinessUnit, type PetSpecies } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";
import { addDaysToKey, setAppTimeZone, zonedDateKey, zonedEndOfDay, zonedStartOfDay } from "./time";
import { isValidTimeZone } from "./settings-shared";
import { rewardCode } from "./loyalty-points";
import { birthdayInYear, birthMonthDay } from "./birthday-dates";
import { couponLabel, COUPON_LABEL_INCLUDE } from "./coupon-label";

// Cupones de cumpleaños (CRM-05): el cliente recibe un % en Cafetería y
// cada mascota un % en Pet Shop (a nombre de su dueño), válidos desde el
// día del cumpleaños durante N días (Configuración → Lealtad).
//
// issueDueBirthdayCoupons corre al arrancar el servidor y cada hora
// (instrumentation.ts). Es idempotente: BirthdayGrant guarda uno por
// festejado y año. Si la Mac estuvo apagada el día del cumpleaños, el
// cupón se entrega en cuanto vuelve, mientras siga dentro de su vigencia,
// y vence el mismo día que habría vencido.
//
// Sin imports "server-only": también lo corren las pruebas e2e.

export type BirthdayConfig = {
  customerPercent: number;
  petPercent: number;
  validDays: number;
};

async function loadBirthdayConfig(): Promise<BirthdayConfig | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: DEFAULT_BRANCH_ID },
    select: { timeZone: true, birthdayCustomerPercent: true, birthdayPetPercent: true, birthdayCouponValidDays: true },
  });
  if (!branch) return null;
  // "Hoy" es el de la sucursal (lib/time.ts), también fuera de una petición.
  if (branch.timeZone && isValidTimeZone(branch.timeZone)) setAppTimeZone(branch.timeZone);
  return {
    customerPercent: branch.birthdayCustomerPercent,
    petPercent: branch.birthdayPetPercent,
    validDays: Math.max(1, branch.birthdayCouponValidDays),
  };
}

// El cumpleaños que se está festejando hoy (hoy cae dentro de sus N días de
// vigencia), o null. Revisa también el del año pasado para el que cae a
// fin de año y se festeja ya en enero.
export function activeBirthday(birthDate: Date | string, todayKey: string, validDays: number) {
  const monthDay = birthMonthDay(birthDate);
  const year = Number(todayKey.slice(0, 4));
  for (const y of [year, year - 1]) {
    const day = birthdayInYear(monthDay, y);
    if (day <= todayKey && todayKey <= addDaysToKey(day, validDays - 1)) return { day, year: y };
  }
  return null;
}

// Próximo festejo a partir de hoy (el de hoy, si es hoy).
function nextBirthday(birthDate: Date | string, todayKey: string) {
  const monthDay = birthMonthDay(birthDate);
  const year = Number(todayKey.slice(0, 4));
  const thisYear = birthdayInYear(monthDay, year);
  return thisYear >= todayKey ? { day: thisYear, year } : { day: birthdayInYear(monthDay, year + 1), year: year + 1 };
}

export function customerSubject(customerId: string) {
  return `CLIENTE:${customerId}`;
}
export function petSubject(petId: string) {
  return `MASCOTA:${petId}`;
}

type Subject = {
  subjectKey: string;
  customerId: string;
  petId: string | null;
  birthDate: Date;
  birthDateSetAt: Date | null;
  percent: number;
  businessUnit: BusinessUnit;
};

// Días que la fecha de cumpleaños debe llevar registrada antes del festejo.
export const BIRTHDATE_LEAD_DAYS = 30;

// Un cumpleaños solo cuenta si la fecha se registró al menos
// BIRTHDATE_LEAD_DAYS antes (capturar o cambiar la fecha, o dar de alta otra
// vez a una mascota con el cumpleaños de mañana, no saca cupón) y si de
// verdad cumple años (no el mismo año en que nació). birthDateSetAt null =
// fecha registrada antes de que existiera el campo (la migración); toda
// captura o cambio posterior lo llena.
export function qualifiesForCoupon(
  subject: { birthDate: Date; birthDateSetAt: Date | null },
  occurrence: { day: string; year: number }
) {
  if (occurrence.year <= subject.birthDate.getUTCFullYear()) return false;
  if (!subject.birthDateSetAt) return true;
  return subject.birthDateSetAt < zonedStartOfDay(addDaysToKey(occurrence.day, -BIRTHDATE_LEAD_DAYS));
}

async function grantBirthdayCoupon(subject: Subject, occurrence: { day: string; year: number }, validDays: number) {
  try {
    await prisma.$transaction(async (tx) => {
      const grant = await tx.birthdayGrant.create({
        data: { subjectKey: subject.subjectKey, year: occurrence.year, customerId: subject.customerId, petId: subject.petId },
      });
      const code = await tx.discountCode.create({
        data: {
          code: rewardCode("CUMPLE"),
          type: "PORCENTAJE",
          value: subject.percent,
          businessUnit: subject.businessUnit,
          customerId: subject.customerId,
          category: "CLIENTE_ESPECIFICO",
          expiresAt: zonedEndOfDay(addDaysToKey(occurrence.day, validDays - 1)),
        },
      });
      await tx.birthdayGrant.update({ where: { id: grant.id }, data: { discountCodeId: code.id } });
    });
    return true;
  } catch (err) {
    // Otra corrida ya lo entregó (o chocó el código: se reintenta en la
    // siguiente, porque la transacción no dejó nada).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

export async function issueDueBirthdayCoupons(now: Date = new Date()): Promise<number> {
  const config = await loadBirthdayConfig();
  if (!config || (config.customerPercent <= 0 && config.petPercent <= 0)) return 0;
  const todayKey = zonedDateKey(now);

  const customers = await prisma.customer.findMany({
    where: { OR: [{ birthDate: { not: null } }, { pets: { some: { birthDate: { not: null } } } }] },
    select: {
      id: true,
      birthDate: true,
      birthDateSetAt: true,
      pets: { where: { birthDate: { not: null } }, select: { id: true, birthDate: true, birthDateSetAt: true } },
    },
  });

  const subjects: Subject[] = [];
  for (const c of customers) {
    if (c.birthDate && config.customerPercent > 0) {
      subjects.push({
        subjectKey: customerSubject(c.id),
        customerId: c.id,
        petId: null,
        birthDate: c.birthDate,
        birthDateSetAt: c.birthDateSetAt,
        percent: config.customerPercent,
        businessUnit: "CAFE",
      });
    }
    if (config.petPercent > 0) {
      for (const pet of c.pets) {
        subjects.push({
          subjectKey: petSubject(pet.id),
          customerId: c.id,
          petId: pet.id,
          birthDate: pet.birthDate!,
          birthDateSetAt: pet.birthDateSetAt,
          percent: config.petPercent,
          businessUnit: "PET_SHOP",
        });
      }
    }
  }

  const due = subjects
    .map((s) => ({ subject: s, occurrence: activeBirthday(s.birthDate, todayKey, config.validDays) }))
    .filter(
      (d): d is { subject: Subject; occurrence: { day: string; year: number } } =>
        d.occurrence !== null && qualifiesForCoupon(d.subject, d.occurrence)
    );
  if (due.length === 0) return 0;

  const given = await prisma.birthdayGrant.findMany({
    where: { subjectKey: { in: due.map((d) => d.subject.subjectKey) } },
    select: { subjectKey: true, year: true },
  });
  const givenKeys = new Set(given.map((g) => `${g.subjectKey}|${g.year}`));

  // Tope de cupones de mascota por cliente y año: no más que mascotas con
  // cumpleaños registrado. Cuentan también los de mascotas ya borradas, así
  // que borrar y volver a dar de alta no abre lugar para otro.
  const petsWithDates = new Map(customers.map((c) => [c.id, c.pets.length]));
  const petGrants = await prisma.birthdayGrant.findMany({
    where: {
      customerId: { in: Array.from(new Set(due.filter((d) => d.subject.petId).map((d) => d.subject.customerId))) },
      subjectKey: { startsWith: "MASCOTA:" },
    },
    select: { customerId: true, year: true },
  });
  const petGrantCount = new Map<string, number>();
  for (const g of petGrants) {
    const key = `${g.customerId}|${g.year}`;
    petGrantCount.set(key, (petGrantCount.get(key) ?? 0) + 1);
  }

  let issued = 0;
  for (const { subject, occurrence } of due) {
    if (givenKeys.has(`${subject.subjectKey}|${occurrence.year}`)) continue;
    const capKey = `${subject.customerId}|${occurrence.year}`;
    if (subject.petId && (petGrantCount.get(capKey) ?? 0) >= (petsWithDates.get(subject.customerId) ?? 0)) continue;
    if (await grantBirthdayCoupon(subject, occurrence, config.validDays)) {
      issued += 1;
      if (subject.petId) petGrantCount.set(capKey, (petGrantCount.get(capKey) ?? 0) + 1);
    }
  }
  return issued;
}

export type UpcomingBirthday = {
  key: string;
  kind: "CLIENTE" | "MASCOTA";
  name: string;
  species: PetSpecies | null;
  customerId: string;
  customerName: string;
  phone: string | null;
  day: string; // "YYYY-MM-DD" del festejo
  daysAway: number; // 0 = hoy; negativo = ya pasó y su cupón sigue vigente
  turning: number | null; // años que cumple
  coupon: { code: string; label: string; status: "disponible" | "usado" | "vencido" | "inactivo"; expiresAt: string | null } | null;
};

function daysBetween(fromKey: string, toKey: string) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

// Cumpleaños de clientes y mascotas de los próximos `days` días, más los
// que ya pasaron pero siguen con su cupón vigente — para Clientes →
// Cumpleaños (felicitar por WhatsApp con el código).
export async function getUpcomingBirthdays(days = 30, now: Date = new Date()): Promise<UpcomingBirthday[]> {
  const config = await loadBirthdayConfig();
  const validDays = config?.validDays ?? 7;
  const todayKey = zonedDateKey(now);
  const lastKey = addDaysToKey(todayKey, days);

  const customers = await prisma.customer.findMany({
    where: { OR: [{ birthDate: { not: null } }, { pets: { some: { birthDate: { not: null } } } }] },
    select: {
      id: true,
      name: true,
      phone: true,
      birthDate: true,
      pets: { where: { birthDate: { not: null } }, select: { id: true, name: true, species: true, birthDate: true } },
    },
  });

  type Candidate = Omit<UpcomingBirthday, "coupon"> & { subjectKey: string; year: number };
  const candidates: Candidate[] = [];
  function consider(
    subjectKey: string,
    kind: UpcomingBirthday["kind"],
    name: string,
    species: PetSpecies | null,
    birthDate: Date,
    customer: { id: string; name: string; phone: string | null }
  ) {
    const occurrence = activeBirthday(birthDate, todayKey, validDays) ?? nextBirthday(birthDate, todayKey);
    if (occurrence.day > lastKey) return;
    const birthYear = Number(birthDate.toISOString().slice(0, 4));
    candidates.push({
      key: `${subjectKey}|${occurrence.year}`,
      subjectKey,
      year: occurrence.year,
      kind,
      name,
      species,
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      day: occurrence.day,
      daysAway: daysBetween(todayKey, occurrence.day),
      turning: occurrence.year - birthYear > 0 ? occurrence.year - birthYear : null,
    });
  }
  for (const c of customers) {
    if (c.birthDate) consider(customerSubject(c.id), "CLIENTE", c.name, null, c.birthDate, c);
    for (const pet of c.pets) consider(petSubject(pet.id), "MASCOTA", pet.name, pet.species, pet.birthDate!, c);
  }

  const grants = await prisma.birthdayGrant.findMany({
    where: { subjectKey: { in: candidates.map((c) => c.subjectKey) } },
    include: { discountCode: { include: COUPON_LABEL_INCLUDE } },
  });
  const grantByKey = new Map(grants.map((g) => [`${g.subjectKey}|${g.year}`, g]));

  return candidates
    .map(({ subjectKey: _subjectKey, year: _year, ...c }) => {
      const code = grantByKey.get(c.key)?.discountCode;
      return {
        ...c,
        coupon: code
          ? {
              code: code.code,
              label: couponLabel(code),
              status: !code.isActive
                ? ("inactivo" as const)
                : code.usedAt
                  ? ("usado" as const)
                  : code.expiresAt && code.expiresAt < now
                    ? ("vencido" as const)
                    : ("disponible" as const),
              expiresAt: code.expiresAt?.toISOString() ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
}
