import "server-only";
import { headers } from "next/headers";

// Límite de intentos fallidos de PIN/password por IP — un PIN de 4 dígitos
// son solo 10,000 combinaciones, así que sin límite se puede adivinar por
// fuerza bruta (login, autorización de descuento, apertura/cierre de
// turno, aprobación de conteos).
//
// En memoria del proceso: suficiente para un solo servidor (el caso de una
// sucursal). Si algún día se corre en varias instancias/serverless, mover
// este contador a la base o a Redis.
const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };
const attempts = new Map<string, Entry>();

export const TOO_MANY_ATTEMPTS_MESSAGE =
  "Demasiados intentos fallidos. Espera 5 minutos antes de volver a intentar.";

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
  if (!entry || now - entry.firstFailureAt > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    entry.failures = 0;
    entry.firstFailureAt = now;
  }
}

export async function clearFailures(scope: string) {
  attempts.delete(await clientKey(scope));
}
