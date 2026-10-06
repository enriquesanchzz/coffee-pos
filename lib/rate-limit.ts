import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";
import { DEFAULT_SETTINGS, tooManyAttemptsText } from "./settings-shared";

// Límite de intentos fallidos de PIN/password por IP — un PIN de 4 dígitos
// son solo 10,000 combinaciones, así que sin límite se puede adivinar por
// fuerza bruta (login, autorización de descuento, apertura/cierre de
// turno, aprobación de conteos).
//
// En memoria del proceso: suficiente para un solo servidor (el caso de una
// sucursal). Si algún día se corre en varias instancias/serverless, mover
// este contador a la base o a Redis.
//
// Intentos y minutos de bloqueo se ajustan en Configuración → Seguridad
// (pinMaxAttempts, pinLockMinutes); la ventana de conteo dura lo mismo que
// el bloqueo.
async function limits() {
  const branch = await prisma.branch.findUnique({
    where: { id: DEFAULT_BRANCH_ID },
    select: { pinMaxAttempts: true, pinLockMinutes: true },
  });
  const maxFailures = branch?.pinMaxAttempts ?? DEFAULT_SETTINGS.pinMaxAttempts;
  const lockMinutes = branch?.pinLockMinutes ?? DEFAULT_SETTINGS.pinLockMinutes;
  return { maxFailures, lockMinutes, windowMs: lockMinutes * 60 * 1000, lockMs: lockMinutes * 60 * 1000 };
}

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };
const attempts = new Map<string, Entry>();


export class TooManyAttemptsError extends Error {
  constructor(minutes: number) {
    super(tooManyAttemptsText(minutes));
    this.name = "TooManyAttemptsError";
  }
}

// Error listo para lanzar con los minutos configurados.
export async function tooManyAttemptsError() {
  return new TooManyAttemptsError((await limits()).lockMinutes);
}

async function clientKey(scope: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

export async function isLockedOut(scope: string): Promise<boolean> {
  const entry = attempts.get(await clientKey(scope));
  return !!entry && entry.lockedUntil > Date.now();
}

export async function recordFailure(scope: string) {
  const key = await clientKey(scope);
  const now = Date.now();
  const entry = attempts.get(key);
  const { maxFailures, windowMs, lockMs } = await limits();
  if (!entry || now - entry.firstFailureAt > windowMs) {
    attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= maxFailures) {
    entry.lockedUntil = now + lockMs;
    entry.failures = 0;
    entry.firstFailureAt = now;
  }
}

export async function clearFailures(scope: string) {
  attempts.delete(await clientKey(scope));
}
