"use server";

import { redirect } from "next/navigation";
import {
  clearSession,
  findEmployeeByEmailPassword,
  findEmployeeByPin,
  setSessionEmployee,
} from "@/lib/session";

export async function loginWithPin(formData: FormData) {
  const pin = String(formData.get("pin") ?? "").trim();
  const employee = pin ? await findEmployeeByPin(pin) : null;

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
  const employee = email && password ? await findEmployeeByEmailPassword(email, password) : null;

  if (!employee) {
    redirect("/administracion/login?error=credenciales");
  }

  await setSessionEmployee(employee.id, "password");
  redirect("/administracion");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}
