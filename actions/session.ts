"use server";

import { redirect } from "next/navigation";
import {
  clearSession,
  findEmployeeByEmailPassword,
  findEmployeeByPin,
  resolveRoleName,
  setSessionEmployee,
} from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { TOO_MANY_ATTEMPTS_MESSAGE } from "@/lib/rate-limit";

// findEmployeeBy* lanzan TOO_MANY_ATTEMPTS_MESSAGE al pasar el límite de
// intentos (lib/rate-limit.ts) — aquí se traduce a un ?error= del login.
async function lookup<T>(fn: () => Promise<T>): Promise<T | "bloqueado"> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === TOO_MANY_ATTEMPTS_MESSAGE) return "bloqueado";
    throw err;
  }
}

export async function loginWithPin(formData: FormData) {
  const pin = String(formData.get("pin") ?? "").trim();
  // Vacío no cuenta como intento fallido (QA-029).
  if (!pin) redirect("/?error=vacio");
  const employee = await lookup(() => findEmployeeByPin(pin));

  if (employee === "bloqueado") {
    redirect("/?error=bloqueado");
  }
  if (!employee) {
    redirect("/?error=pin");
  }

  await setSessionEmployee(employee.id, "pin");
  redirect("/pos");
}

// Login "fuerte" (email + password), exigido para entrar a Administración —
// ver nota en lib/session.ts sobre el modelo híbrido de login.
export async function loginAdmin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const employee =
    email && password ? await lookup(() => findEmployeeByEmailPassword(email, password)) : null;

  if (employee === "bloqueado") {
    redirect("/administracion/login?error=bloqueado");
  }
  if (!employee) {
    redirect("/administracion/login?error=credenciales");
  }

  // Administración es exclusiva del rol ADMINISTRADOR (ver resolveRoleName).
  // Sin este chequeo, un GERENTE con password entraba y la página lo
  // regresaba a /pos sin ninguna explicación.
  const withRole = await prisma.employee.findUnique({
    where: { id: employee.id },
    include: { branches: { include: { role: { include: { permissions: true } } } } },
  });
  if (!withRole || resolveRoleName(withRole, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") {
    redirect("/administracion/login?error=rol");
  }

  await setSessionEmployee(employee.id, "password");
  redirect("/administracion");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}
