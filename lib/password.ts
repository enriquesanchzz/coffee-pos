import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

// Hashing genérico para secretos cortos (PIN de 4 dígitos, password de
// Administración) — mismo primitivo para ambos, ver lib/session.ts. scrypt +
// salt aleatorio por registro es el patrón que la propia documentación de
// Node recomienda para esto, sin depender de una librería externa.
export async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifySecret(
  plain: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;

  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const storedHash = Buffer.from(hashHex, "hex");
  const derivedKey = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;

  if (storedHash.length !== derivedKey.length) return false;
  return timingSafeEqual(storedHash, derivedKey);
}
