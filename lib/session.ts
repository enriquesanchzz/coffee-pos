import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { prisma } from "./prisma";
import { verifySecret } from "./password";

// -----------------------------------------------------------------------
// Sesión real: cookie sellada/firmada con iron-session (no se puede
// falsificar o alterar del lado del cliente) y expiración real.
//
// Login híbrido (decisión de producto, ver docs/CONTINUE.md):
//   - authLevel "pin"      -> login rápido por PIN en el POS/Caja, para
//                             identificar quién opera. El PIN sigue
//                             existiendo por practicidad en un mostrador
//                             compartido, pero ahora se guarda hasheado
//                             (ver lib/password.ts) y se compara sin texto
//                             plano.
//   - authLevel "password" -> login con email+password, exigido solo para
//                             entrar a Administración (editar empleados,
//                             roles, etc. requiere más que un PIN de 4
//                             dígitos tecleado en un equipo compartido).
// Un login "password" es una sesión estrictamente más fuerte: sirve también
// para todo lo que hoy usa getCurrentEmployee() (POS, Caja, Inventario...).
// -----------------------------------------------------------------------

export type AuthLevel = "pin" | "password";

type SessionData = {
  employeeId?: string;
  authLevel?: AuthLevel;
};

const sessionOptions: SessionOptions = {
  password: requireSessionSecret(),
  cookieName: process.env.SESSION_COOKIE_NAME || "nomada_pos_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // 12h — cubre un turno; se renueva al reabrir sesión.
    maxAge: 60 * 60 * 12,
  },
};

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET falta o es muy corto (mínimo 32 caracteres) — ver .env.example."
    );
  }
  return secret;
}

async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function setSessionEmployee(employeeId: string, authLevel: AuthLevel) {
  const session = await getSession();
  session.employeeId = employeeId;
  session.authLevel = authLevel;
  await session.save();
}

export async function clearSession() {
  const session = await getSession();
  session.destroy();
}

export async function getSessionEmployeeId(): Promise<string | null> {
  const session = await getSession();
  return session.employeeId ?? null;
}

export async function getSessionAuthLevel(): Promise<AuthLevel | null> {
  const session = await getSession();
  return session.authLevel ?? null;
}

export async function getCurrentEmployee() {
  const employeeId = await getSessionEmployeeId();
  if (!employeeId) return null;

  return prisma.employee.findUnique({
    where: { id: employeeId, isActive: true },
    include: {
      branches: {
        include: { role: { include: { permissions: true } } },
      },
    },
  });
}

// Para rutas/acciones de Administración: exige que la sesión actual se haya
// iniciado con password (no basta con un PIN). Devuelve el empleado o null.
export async function requirePasswordSession() {
  const authLevel = await getSessionAuthLevel();
  if (authLevel !== "password") return null;
  return getCurrentEmployee();
}

// Compara contra el conjunto de empleados activos con PIN configurado —
// con hash+salt por fila no hay forma de indexar una búsqueda directa por
// igualdad, pero a esta escala (decenas de empleados por sucursal) es
// trivial recorrerlos.
export async function findEmployeeByPin(pin: string) {
  if (!pin) return null;

  const candidates = await prisma.employee.findMany({
    where: { isActive: true, pin: { not: null } },
  });

  for (const candidate of candidates) {
    if (await verifySecret(pin, candidate.pin)) {
      return candidate;
    }
  }
  return null;
}

export async function findEmployeeByEmailPassword(email: string, password: string) {
  if (!email || !password) return null;

  const employee = await prisma.employee.findFirst({
    where: { email, isActive: true },
  });
  if (!employee) return null;

  const valid = await verifySecret(password, employee.passwordHash);
  return valid ? employee : null;
}
