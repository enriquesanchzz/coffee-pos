import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

// -----------------------------------------------------------------------
// Sesión placeholder por PIN de empleado.
//
// Esto NO es autenticación real: no hay hash de contraseña con salt en el
// login (el PIN se compara en texto plano contra `Employee.pin`), no hay
// expiración de sesión, y la cookie solo guarda el id del empleado sin
// firmar. Es suficiente para operar el POS en piso mientras se construye el
// módulo de Administración, donde debe sustituirse por un proveedor real
// (Supabase Auth es el plan, ver docs/adr-nomada-pos.md). No usar este
// mecanismo para proteger nada fuera del flujo normal de venta en tienda.
// -----------------------------------------------------------------------

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "nomada_pos_session";

export async function getSessionEmployeeId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setSessionEmployee(employeeId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, employeeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 12h — cubre un turno; se renueva al reabrir sesión.
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
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

export async function findEmployeeByPin(pin: string) {
  return prisma.employee.findFirst({
    where: { pin, isActive: true },
  });
}
