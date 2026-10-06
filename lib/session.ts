import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { prisma } from "./prisma";
import { verifySecret } from "./password";
import { clearFailures, isLockedOut, recordFailure, tooManyAttemptsError } from "./rate-limit";
import { DEFAULT_SETTINGS } from "./settings-shared";
import { DEFAULT_BRANCH_ID } from "./constants";
import { syncAppTimeZone } from "./settings";

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

// Sesión vencida, cerrada en otra pestaña o reemplazada por otro empleado:
// safeAction (lib/safe-action.ts) la regresa con `redirectTo` y el cliente
// manda al login con un mensaje claro, en vez de mostrar "El empleado no
// coincide con la sesión activa" sin explicar qué hacer (QA-011).
export class SessionExpiredError extends Error {
  constructor(
    message: string,
    public redirectTo: string = "/?error=sesion"
  ) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

// Valida que el employeeId que manda el cliente sea el de la sesión activa.
export async function assertSessionEmployee(employeeId: string) {
  const sessionEmployeeId = await getSessionEmployeeId();
  if (!sessionEmployeeId) {
    throw new SessionExpiredError("Tu sesión expiró. Vuelve a ingresar tu PIN.");
  }
  if (sessionEmployeeId !== employeeId) {
    throw new SessionExpiredError(
      "Otro empleado inició sesión en este navegador. La pantalla se actualizará.",
      "/pos"
    );
  }
}

type SessionData = {
  employeeId?: string;
  authLevel?: AuthLevel;
  // Inicio de la sesión (ms) — la duración se valida contra
  // Configuración → Seguridad (sessionHours), no solo con la cookie.
  issuedAt?: number;
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

async function getSession(maxAgeSeconds?: number) {
  const options = maxAgeSeconds
    ? { ...sessionOptions, cookieOptions: { ...sessionOptions.cookieOptions, maxAge: maxAgeSeconds } }
    : sessionOptions;
  return getIronSession<SessionData>(await cookies(), options);
}

async function sessionHours() {
  const branch = await prisma.branch.findUnique({
    where: { id: DEFAULT_BRANCH_ID },
    select: { sessionHours: true },
  });
  return branch?.sessionHours ?? DEFAULT_SETTINGS.sessionHours;
}

export async function setSessionEmployee(employeeId: string, authLevel: AuthLevel) {
  const session = await getSession((await sessionHours()) * 60 * 60);
  session.employeeId = employeeId;
  session.authLevel = authLevel;
  session.issuedAt = Date.now();
  await session.save();
}

export async function clearSession() {
  const session = await getSession();
  session.destroy();
}

export async function getSessionEmployeeId(): Promise<string | null> {
  const session = await getSession();
  if (!session.employeeId) return null;
  // Sesiones anteriores a este cambio no tienen issuedAt: se respetan
  // hasta que expire su cookie.
  if (session.issuedAt && Date.now() - session.issuedAt > (await sessionHours()) * 60 * 60 * 1000) {
    return null;
  }
  // Cada página autenticada pasa por aquí: aplica la zona horaria
  // configurada antes de calcular fechas (ver lib/settings.ts).
  await syncAppTimeZone();
  return session.employeeId;
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

// Gate por identidad de rol (no por permiso): Administración y los módulos
// que ahora viven bajo ella (Clientes/Reportes/Compras/Productos/
// Inventario) solo deben ser visibles/accesibles para el rol ADMINISTRADOR
// exacto, sin importar qué permisos granulares tenga alguien más vía
// EmployeePermissionOverride — por eso se resuelve directo del `role.name`
// de EmployeeBranch, no de getEffectivePermissions (lib/permissions.ts).
export function resolveRoleName(
  employee: NonNullable<Awaited<ReturnType<typeof getCurrentEmployee>>>,
  branchId: string
) {
  return employee.branches.find((b) => b.branchId === branchId)?.role.name ?? null;
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
// trivial recorrerlos. El PIN es único entre empleados activos (lo exige
// actions/employees.ts vía isPinTaken), así que el primer match es el único.
//
// Con límite de intentos fallidos por IP (lib/rate-limit.ts): pasado el
// límite lanza TooManyAttemptsError (lib/rate-limit.ts) en vez de seguir
// comparando.
export async function findEmployeeByPin(pin: string) {
  if (!pin) return null;
  if (await isLockedOut("pin")) {
    throw await tooManyAttemptsError();
  }

  const match = await matchPin(pin);
  if (match) {
    await clearFailures("pin");
  } else {
    await recordFailure("pin");
  }
  return match;
}

async function matchPin(pin: string, excludeEmployeeId?: string) {
  const candidates = await prisma.employee.findMany({
    where: {
      isActive: true,
      pin: { not: null },
      ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  for (const candidate of candidates) {
    if (await verifySecret(pin, candidate.pin)) {
      return candidate;
    }
  }
  return null;
}

// Para alta/edición de empleados: dos empleados activos con el mismo PIN
// harían que el login por PIN siempre resuelva al primero — el segundo
// nunca podría entrar y sus ventas quedarían a nombre del otro.
export async function isPinTaken(pin: string, excludeEmployeeId?: string) {
  return (await matchPin(pin, excludeEmployeeId)) !== null;
}

export async function findEmployeeByEmailPassword(email: string, password: string) {
  if (!email || !password) return null;
  if (await isLockedOut("password")) {
    throw await tooManyAttemptsError();
  }

  const employee = await prisma.employee.findFirst({
    // Sin distinguir mayúsculas: en celular el teclado capitaliza la primera
    // letra y "Ana@…" no entraba (QA-010).
    where: { email: { equals: email.trim(), mode: "insensitive" }, isActive: true },
  });
  const valid = employee ? await verifySecret(password, employee.passwordHash) : false;

  if (!valid) {
    await recordFailure("password");
    return null;
  }
  await clearFailures("password");
  return employee;
}
